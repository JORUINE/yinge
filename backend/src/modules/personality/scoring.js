/**
 * 人格测评计分与类型匹配
 * ------------------------------------------------------------
 * 维度不写死：题目选项里的 score 对象带哪些维度，计分就产出哪些维度。
 * 这样后台改题即可调整计分模型，无需改代码（设计文档 5.6.1 的用意）。
 */

/** 汇总各维度得分 */
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

/** 归一化到 0~1，便于与类型特征向量做相似度比较 */
export function normalizeScores(scores) {
  const values = Object.values(scores || {}).map((v) => Math.abs(Number(v) || 0));
  const max = Math.max(1, ...values);
  const out = {};
  for (const [key, value] of Object.entries(scores || {})) out[key] = (Number(value) || 0) / max;
  return out;
}

/** 余弦相似度匹配最贴近的人格类型 */
export function matchType(scores, types) {
  if (!types || !types.length) return null;
  const norm = normalizeScores(scores);
  let best = null;
  let bestScore = -Infinity;

  for (const type of types) {
    const dims = type.dims || {};
    const keys = new Set([...Object.keys(norm), ...Object.keys(dims)]);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const key of keys) {
      const a = norm[key] ?? 0;
      const b = Number(dims[key] ?? 0);
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }
    const similarity = normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
    if (similarity > bestScore) {
      bestScore = similarity;
      best = type;
    }
  }
  return best;
}

/** 降级文案：AI 不可用时使用，保证功能可用性（NFR：外部依赖降级） */
export function buildTemplateComment({ typeName, description, scores, nickname }) {
  const topDims = Object.entries(scores || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 2)
    .map(([key]) => key);
  const who = nickname ? `${nickname}，` : '';
  const emphasis = topDims.length ? `你在「${topDims.join('」与「')}」上表现突出，` : '';
  return `${who}你的人格类型是「${typeName}」。${description}${emphasis}这让你在挑选专辑时更在意与之呼应的表达方式。`;
}

export default { computeScores, normalizeScores, matchType, buildTemplateComment };
