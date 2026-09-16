/**
 * 通用格式化与标签
 */
export const SCOPE_LABELS = {
  artist: '单歌手混打',
  'multi-artist': '多歌手混战',
  genre: '流派对决',
  era: '年代对决',
  custom: '手动挑选',
  aligned: '对位赛',
  duel: '指定对决',
};

export const scopeLabel = (t) => SCOPE_LABELS[t] || t;

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export function fmtDateTime(d) {
  return fmtDate(d);
}
