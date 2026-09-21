/**
 * 人格测评计分与类型匹配
 * ------------------------------------------------------------
 * ⚠️ 2026-09-22 重做（配合 6 维计分）：
 *   ① 归一化从"除以最大值"改成**除以该维度的理论满分**。
 *      为什么要改：题目是随机的，每次抽到的题里某个维度可能出现得多、某个维度出现得少。
 *      除以最大值时，四/六维之间是**相对比较**，一道维度偏多的题就能把整体形状带歪；
 *      除以"本次抽到的题里这一维度最高能拿多少分"之后，每一维都是独立的 0~1 倾向值，
 *      不同次测评之间也可比（用户说的"随机题库"必须配这条，否则每次结果漂移）。
 *   ② 匹配从"等权余弦"改成**按维度区分度加权的余弦**。
 *      权重 = 该维度在 6 个类型特征值上的标准差（自动算，不手调）：
 *      区分度大的维度（比如 calm，各型从 0.12 到 1.0）说话更算数，
 *      区分度小的维度（比如 melody，各型都在 0.45~1.0）权重更低。
 *      这是类 LDA 的简化思路 —— 用类间方差做特征加权，让"最能把 6 个型分开的那个维度"主导判断。
 *   ③ 另出 `toDisplayDims()`：把 6 维折算回人格卡那 4 根条（前端零改动）。
 */

import { DIMS, DISPLAY_DIMS, DIM_LABELS } from '../../data/personality.js';

/** 汇总各维度原始得分 */
export function computeScores(questions, answers) {
  const byOrder = new Map(questions.map((q) => [q.order, q]));
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const scores = {};

  for (const answer of answers) {
    const question = byId.get(String(answer.questionId)) || byOrder.get(answer.order);
    if (!question) continue;
    const option = (question.options || []).find((o) => o.key === answer.optionKey);
    if (!option || !option.score) continue;
    for (const [dim, value] of Object.entries(option.score)) {
      scores[dim] = (scores[dim] || 0) + Number(value || 0);
    }
  }
  return scores;
}

/**
 * 本次题集的"每维度理论满分"：把每道题里该维度能拿到的最高分加起来。
 * 例：某维度在 3 道题里最高分别是 3/2/3 分 → 满分 8 分。
 */
export function maxByDim(questions) {
  const out = {};
  for (const q of questions || []) {
    const best = {};
    for (const option of q.options || []) {
      for (const [dim, value] of Object.entries(option.score || {})) {
        const v = Number(value) || 0;
        if (!best[dim] || v > best[dim]) best[dim] = v;
      }
    }
    for (const [dim, v] of Object.entries(best)) out[dim] = (out[dim] || 0) + v;
  }
  return out;
}

/**
 * 归一化到 0~1：每一维**各自**除以自己的理论满分。
 * ⚠️ 不再是"除以全局最大值"（那会让各维互相挤兑，随机抽题时结果不稳）。
 */
export function normalizeScores(scores, ceilings) {
  const out = {};
  for (const dim of DIMS) {
    const raw = Number(scores?.[dim]) || 0;
    const cap = Number(ceilings?.[dim]) || 0;
    out[dim] = cap > 0 ? Math.min(1, raw / cap) : 0;
  }
  return out;
}

/**
 * 维度区分度权重：用 6 个类型的特征值标准差当权重（归一化到均值 1）。
 * 这样"能把 6 个型分开的维度"主导判断，而所有型差不多的维度不添乱。
 */
export function dimWeights(types) {
  const list = (types || []).map((t) => t.dims || {});
  const weights = {};
  for (const dim of DIMS) {
    const values = list.map((d) => Number(d[dim] ?? 0));
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length || 1);
    weights[dim] = Math.sqrt(variance);
  }
  const avg = DIMS.reduce((a, d) => a + weights[d], 0) / DIMS.length || 1;
  for (const dim of DIMS) weights[dim] = Math.max(0.35, weights[dim] / avg);
  return weights;
}

/**
 * 加权余弦相似度匹配最贴近的人格类型
 * @param {object} norm  归一化后的 6 维向量（0~1）
 * @param {Array}  types 6 个类型
 * @param {object} [weights] 维度权重（不传则等权）
 * @returns {{type: object, similarity: number, ranking: Array}}
 */
export function matchType(norm, types, weights) {
  if (!types || !types.length) return null;
  const w = weights || Object.fromEntries(DIMS.map((d) => [d, 1]));
  const ranking = [];

  for (const type of types) {
    const dims = type.dims || {};
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const dim of DIMS) {
      const weight = Number(w[dim] ?? 1);
      const a = Number(norm?.[dim] ?? 0) * weight;
      const b = Number(dims[dim] ?? 0) * weight;
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }
    const similarity = normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
    ranking.push({ code: type.code, name: type.name, similarity: Number(similarity.toFixed(4)) });
  }

  ranking.sort((a, b) => b.similarity - a.similarity);
  const best = types.find((t) => t.code === ranking[0]?.code) || null;
  return { type: best, similarity: ranking[0]?.similarity ?? 0, ranking };
}

/**
 * 6 维计分 → 人格卡那 4 根展示条
 * ------------------------------------------------------------
 * 映射口径（写死在这里，别在各页面各写一份）：
 *   melody      ← melody
 *   rhythm      ← rhythm
 *   arrangement ← (lyric + texture) / 2   「词写得讲究」和「制作有讲究」在展示上都属于"编曲/文本的层次"
 *   calm        ← calm
 * ⚠️ novelty 不进展示（它是"探索欲"，塞进任何一根条都会让那根条的含义变模糊）；
 *    但它在匹配里权重很高，所以探索者依然会被准确识别。
 */
export function toDisplayDims(norm) {
  const out = {};
  for (const dim of DISPLAY_DIMS) {
    if (dim === 'arrangement') {
      out.arrangement = Number((((norm?.lyric ?? 0) + (norm?.texture ?? 0)) / 2).toFixed(4));
    } else {
      out[dim] = Number((norm?.[dim] ?? 0).toFixed(4));
    }
  }
  return out;
}

/**
 * 降级文案：AI 不可用时使用，保证功能可用性（NFR：外部依赖降级）
 * ⚠️ 2026-09-22 修：这里原来直接把维度**键名**拼进了句子 ——
 *   随着计分维度从 4 个扩到 6 个（melody/rhythm/lyric/texture/novelty/calm），
 *   人格卡上就出现了「你在「lyric」与「rhythm」上表现突出」这种**中英混杂**的句子。
 *   现在统一走 DIM_LABELS 映射成中文（文本共鸣 / 节奏偏好…），
 *   句尾也补一句"这体现在哪"，别让用户看完不知道自己这型意味着什么。
 */
export function buildTemplateComment({ typeName, description, scores, nickname }) {
  const top = Object.entries(scores || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 2)
    .map(([key]) => DIM_LABELS[key] || key);
  const who = nickname ? `${nickname}，` : '';
  const emphasis = top.length ? `其中「${top.join('」和「')}」这两项在你身上最明显，` : '';
  return `${who}你的人格类型是「${typeName}」。${description}${emphasis}这让你在挑专辑时更在意与它呼应的表达方式 —— 去看下面那几推荐，是不是比你自己找的还准。`;
}

export default {
  computeScores,
  maxByDim,
  normalizeScores,
  dimWeights,
  matchType,
  toDisplayDims,
  buildTemplateComment,
};
