/**
 * 由扁平的淘汰赛场次，还原出「完整晋级图」所需的树。
 * ------------------------------------------------------------
 * 根 = 最深一轮（通常是决赛）的那一场；
 * 一个节点的左/右孩子 = **产出该侧专辑的那一场**（找不到就是种子，直接显示专辑）。
 * 这样从决赛往回递归，就能把整棵 1v1 淘汰树完整铺出来（对应《系统设计文档》4.5 淘汰赛）。
 *
 * 前端判定胜方一律用「外部专辑 id」（winnerAlbumExternalId），本地的 winnerAlbumId
 * 是 ObjectId，跟前端拿到的 albumId 永远对不上（2026-09-17 踩过的坑）。
 */
export const KO_ORDER = ['r32', 'r16', 'qf', 'semi', 'final'];

export function isKnockoutRound(name) {
  return KO_ORDER.includes(name);
}

/** 胜方的外部 albumId；后端没给就按票数兜底 */
export function winnerExtIdOf(m) {
  if (m?.winnerAlbumExternalId != null) return String(m.winnerAlbumExternalId);
  const l = Number(m?.leftVotes || 0);
  const r = Number(m?.rightVotes || 0);
  if (l === r) return null;
  const side = l > r ? m.leftAlbum : m.rightAlbum;
  return side ? String(side.albumId) : null;
}

export function buildBracketTree(matches) {
  const ko = (matches || []).filter((m) => isKnockoutRound(m.roundName));
  if (!ko.length) return null;

  const deepest = KO_ORDER.filter((n) => ko.some((m) => m.roundName === n)).pop();
  const roots = ko.filter((m) => m.roundName === deepest);
  const rootMatch = roots.find((m) => !m.isBye) || roots[0];
  if (!rootMatch) return null;

  /** 某个专辑是在哪一场赢出来的（只往更浅的轮次找，因此命中的必然是"上一轮"） */
  const feederOf = (albumExternalId, roundName) => {
    if (!albumExternalId) return null;
    const idx = KO_ORDER.indexOf(roundName);
    for (let i = idx - 1; i >= 0; i -= 1) {
      const hit = ko.find(
        (m) => m.roundName === KO_ORDER[i] && String(winnerExtIdOf(m)) === String(albumExternalId),
      );
      if (hit) return hit;
    }
    return null;
  };

  const nodeOf = (m, depth = 0) => {
    if (!m || depth > 6) return null;
    const childOf = (album) => {
      if (!album) return null;
      const f = feederOf(album.albumId, m.roundName);
      return f ? nodeOf(f, depth + 1) : { album, seed: true };
    };
    return { match: m, left: childOf(m.leftAlbum), right: childOf(m.rightAlbum) };
  };

  return nodeOf(rootMatch);
}

/** 树里一共有多少场（用于"完整"与否的提示） */
export function countNodes(node) {
  if (!node || !node.match) return 0;
  return 1 + countNodes(node.left) + countNodes(node.right);
}

export default { KO_ORDER, isKnockoutRound, winnerExtIdOf, buildBracketTree, countNodes };
