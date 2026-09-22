/**
 * 人格测评「答到一半」的本地续答（2026-09-22）
 * ------------------------------------------------------------
 * 用户："我做一半不小心按到刷新或者退出，重进就要重头来 —— 这个问题要优化。"
 *
 * ⚠️ 关键点：题目是**每次随机抽**的（题库 50 道抽 20 道），
 *    所以只存答案是不够的 —— 刷新后抽到的是**另一套题**，答案对不上任何一题。
 *    必须把「本次抽到的那套题的 id」一起存下来，重进时按这份 id 让服务端**取回同一套题**
 *    （后端 `GET /personality/questions?qids=...`），再把答案与进度填回去。
 *
 * 存储位置：localStorage 的**单一键**（同一浏览器只保留最近一次未完成的测评）。
 * 生命周期：① 每答一题写一次；② 提交成功、或过期（7 天）自动清掉；
 *           ③ 用户点"重新开始"也清掉。
 * ⚠️ 只存**题目 id / 选了哪个 key / 当前第几题**，不存任何个人信息，也不缓存题目内容。
 */
const KEY = 'yinge_personality_quiz_v1';
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 天没动就作废（避免"上周的进度"突然冒出来）

/** 保存进度（任何异常都不能影响答题，所以全程 try/catch 静默） */
export function saveQuizProgress({ qids, answers, idx }) {
  try {
    if (!Array.isArray(qids) || !qids.length) return;
    localStorage.setItem(KEY, JSON.stringify({ qids, answers: answers || {}, idx: idx || 0, ts: Date.now() }));
  } catch {
    /* 隐私模式 / 配额满：静默失败，最多是不能续答，不影响正常答题 */
  }
}

/** 读取进度（过期或损坏返回 null，并顺手清掉） */
export function loadQuizProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.qids?.length) {
      clearQuizProgress();
      return null;
    }
    if (Date.now() - (data.ts || 0) > TTL) {
      clearQuizProgress();
      return null;
    }
    return data;
  } catch {
    clearQuizProgress();
    return null;
  }
}

export function clearQuizProgress() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

/** 已答几题（首页提示"你有一份没答完的测评"用） */
export function quizProgressSummary() {
  const d = loadQuizProgress();
  if (!d) return null;
  const done = Object.keys(d.answers || {}).length;
  if (!done) return null;
  return { done, total: d.qids.length };
}
