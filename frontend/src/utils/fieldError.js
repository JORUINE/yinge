/**
 * 字段校验错误的提取与展示（2026-10-17 第四十四批）
 * ------------------------------------------------------------
 * 用户真机反馈："用户注册时候出现这种提示（字段校验未通过），不知道是我账户名有空格还是什么情况"。
 *
 * 根因（已实测确认）：
 *   后端 `validate()` 中间件其实把具体原因传出来了 ——
 *   `{ code:1001, message:'字段校验未通过', data:[{field:'account', message:'账号仅支持字母、数字与下划线'}] }`
 *   但前端只读 `err.message`（那句通用的"字段校验未通过"），**`err.data` 里的具体原因被丢掉了**
 *   ⇒ 用户只看到"字段校验未通过"，完全不知道该改什么。
 *
 * 这个工具做三件事：
 *   ① 把 `err.data` 里的具体原因提成一句人话（多个字段时合并）
 *   ② 字段名翻译成中文（account → 账号）
 *   ③ 提供注册/登录的格式规则，供前端**提交前**预校验（省一次无谓请求）
 */

/** 字段名 → 中文（后端返回的是英文字段名） */
const FIELD_CN = {
  account: '账号',
  password: '密码',
  nickname: '昵称',
  email: '邮箱',
  code: '验证码',
};

/**
 * 从后端错误里提取"用户看得懂的具体原因"。
 * @param {any} err reject 出来的 body（{code,message,data}）或 Error
 * @returns {string} 一句人话；提不到具体原因就退回 err.message
 */
export function fieldErrorMessage(err) {
  const list = Array.isArray(err?.data) ? err.data : null;
  if (list && list.length) {
    const parts = list
      .map((e) => {
        const cn = FIELD_CN[e.field] || e.field;
        // 后端文案已经是中文口语（"账号至少 4 位"），直接拼字段名即可
        return e.message ? `${cn}：${e.message}` : cn;
      })
      .filter(Boolean);
    if (parts.length) return parts.join('；');
  }
  return err?.message || '操作失败，请稍后重试';
}

/** 注册 / 登录的格式规则（与后端 registerSchema 保持一致，改一处要改两处） */
export const AUTH_RULES = {
  account: {
    pattern: /^[a-zA-Z0-9_]+$/,
    min: 4,
    max: 20,
    /** 常驻提示（placeholder 一打字就消失，用户根本看不见，所以必须另有一行常驻说明） */
    hint: '4-20 位字母、数字或下划线，不能有空格和中文',
  },
  password: { min: 6, max: 64, hint: '至少 6 位' },
  nickname: { min: 2, max: 16, hint: '2-16 个字' },
};

/**
 * 前端预校验：提交前就拦住，省一次请求，也立刻告诉用户哪错。
 * @returns {string|null} 有错返回人话；没错返回 null
 */
export function validateAuthForm({ account, password, nickname }, { isRegister }) {
  const a = String(account || '').trim();
  if (!a) return '请输入账号';
  if (!AUTH_RULES.account.pattern.test(a)) {
    // 区分"有空格/中文"和"特殊字符"，给更具体的指引
    if (/\s/.test(a)) return '账号里不能有空格，请去掉空格再试';
    if (/[\u4e00-\u9fa5]/.test(a)) return '账号不支持中文，请用字母、数字或下划线';
    return '账号只能包含字母、数字和下划线';
  }
  if (a.length < AUTH_RULES.account.min) return `账号至少 ${AUTH_RULES.account.min} 位`;
  if (a.length > AUTH_RULES.account.max) return `账号最多 ${AUTH_RULES.account.max} 位`;
  if (!password) return '请输入密码';
  if (isRegister) {
    if (password.length < AUTH_RULES.password.min) return `密码至少 ${AUTH_RULES.password.min} 位`;
    const n = String(nickname || '').trim();
    if (n.length < AUTH_RULES.nickname.min) return `昵称至少 ${AUTH_RULES.nickname.min} 个字`;
    if (n.length > AUTH_RULES.nickname.max) return `昵称最多 ${AUTH_RULES.nickname.max} 个字`;
  }
  return null;
}

export default { fieldErrorMessage, validateAuthForm, AUTH_RULES };
