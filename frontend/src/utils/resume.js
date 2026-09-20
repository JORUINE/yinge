/**
 * 本地续玩（清单第 13 项 · 2026-09-21）
 * ------------------------------------------------------------
 * 用户场景：开着一局对决，中途关掉浏览器 / 第二天再来 —— 以前只能去「我的对决」里翻，
 * 首页和创建页都不知道"你还有一局没打完"，很容易又开一局重复的。
 *
 * 做法：把「当前这局的 id」记在 localStorage（只记 id，不缓存赛程数据 ——
 * 赛程是服务端的，缓存下来会和真实进度打架）。进来时用 nextStep 问一次，
 * 还没打完就显示一条「继续上次未完成的对决」。
 *
 * ⚠️ 三条纪律：
 *   ① 只记**未完成**的局；打完 / 删掉立刻清（否则会一直挂着一条过期的条）；
 *   ② 一定要**回服务端校验**再用 —— 本地记的是"上次在哪打"，不代表那局现在还是我的、
 *      也不代表它还活着（换设备 / 换账号 / 局被删都会对不上）；
 *   ③ 游客也要能用：localStorage 不挑身份（硬规则：不注册也要能玩全部主线）。
 */
const KEY = 'yinge.resume.v1';

function safeParse(raw) {
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

/** 记住"我正在打这一局" */
export function saveResume(info) {
  if (!info?.id) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        id: String(info.id),
        title: info.title || '',
        cover: info.cover || '',
        ts: Date.now(),
      }),
    );
  } catch {
    /* 隐私模式下 localStorage 会抛，忽略即可 —— 续玩只是锦上添花，不能因为它报错 */
  }
}

export function readResume() {
  try {
    return safeParse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearResume() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
}

/** 只对 id 相同的局生效（避免"打完 A 去打 B，结果 A 的记录把 B 清了"） */
export function clearResumeIf(id) {
  const cur = readResume();
  if (cur && String(cur.id) === String(id)) clearResume();
}
