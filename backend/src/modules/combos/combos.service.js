/**
 * 歌手组合服务
 * ------------------------------------------------------------
 * 「常用组合」与「我收藏组合」共用一张表：
 *   · 系统组合（isSystem）→ 管理员维护，所有人可见；
 *   · 用户组合（ownerId）→ 本人维护，只有本人看得到。
 * 权限口径：系统组合只有管理员能改；用户组合只有本人能改（管理员也不越权改别人的私人组合）。
 */
import { Combo, Battle } from '../../models/index.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../shared/errors.js';

function serialize(c) {
  return {
    comboId: String(c._id),
    label: c.label,
    scopeType: c.scopeType,
    artists: (c.artists || []).map((a) => ({
      artistId: a.artistId,
      name: a.name,
      albumCount: a.albumCount,
    })),
    perArtist: c.perArtist,
    alignCount: c.alignCount,
    isSystem: Boolean(c.isSystem),
    mine: Boolean(c.ownerId),
  };
}

/**
 * 我可以看到的组合 = 系统组合 + 我自己建的。
 * ⚠️ 排序（2026-09-18 用户要求）：**我收藏的组合排在前面**，内置（系统）组合在后。
 *    原来的排序是 isSystem 降序（系统在前），用户明确说"我收藏的优先排在内置的前"。
 */
export async function listCombos(user) {
  const list = await Combo.find({ $or: [{ isSystem: true }, { ownerId: user._id }] }).sort({
    isSystem: 1,
    createdAt: -1,
  });
  return { list: list.map(serialize) };
}

/**
 * 「用户喜爱的 PK 组合」榜单（后台用）
 * ------------------------------------------------------------
 * 口径：不看用户"保存了什么"，只看**真实开过多少局** —— 保存是意愿，开打才是喜爱。
 *   · 数据源 = battles（scopeType = artist / multi-artist / aligned，且带 artists）
 *   · 组合键 = 歌手 id 排序后拼接（所以「周杰伦+林俊杰」和「林俊杰+周杰伦」算同一组）
 *   · 指标 = 开过多少局 / 多少人开过 / 打完多少局 / 最近一次
 *   · 顺带标出"系统组合里已经有同款了吗"，避免管理员重复采纳
 */
export async function popularCombos({ limit = 20 } = {}) {
  const rows = await Battle.aggregate([
    // 只算"多位歌手的组合"：单歌手模式的对手是同一人的不同专辑，
    // 它不是「PK 组合」，混进来会把榜单带偏（2026-09-18 实测发现）
    { $match: { scopeType: { $in: ['multi-artist', 'aligned'] } } },
    { $match: { 'artists.1': { $exists: true } } },
    {
      $project: {
        userId: 1,
        status: 1,
        createdAt: 1,
        artists: 1,
        key: {
          $reduce: {
            input: { $sortArray: { input: '$artists.artistId', sortBy: 1 } },
            initialValue: '',
            in: { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', '|'] }, { $toString: '$$this' }] },
          },
        },
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$key',
        battles: { $sum: 1 },
        users: { $addToSet: '$userId' },
        finished: { $sum: { $cond: [{ $eq: ['$status', 'finished'] }, 1, 0] } },
        lastAt: { $max: '$createdAt' },
        // 最近一局的歌手明细（名字最全，聚合里直接取第一条即可）
        artists: { $first: '$artists' },
      },
    },
    {
      $project: {
        _id: 0,
        key: '$_id',
        battles: 1,
        finished: 1,
        userCount: { $size: '$users' },
        lastAt: 1,
        artists: 1,
      },
    },
    { $sort: { battles: -1, userCount: -1, lastAt: -1 } },
    { $limit: Math.min(Number(limit) || 20, 60) },
  ]);

  // 系统组合里已有的同款（比对歌手 id 集合，与顺序无关）
  const system = await Combo.find({ isSystem: true }).lean();
  const sysKeys = new Set(
    system.map((c) => [...(c.artists || []).map((a) => a.artistId)].sort((a, b) => a - b).join('|')),
  );

  return {
    list: rows.map((r) => ({
      key: r.key,
      label: (r.artists || []).map((a) => a.name).join(' × '),
      artists: (r.artists || []).map((a) => ({
        artistId: a.artistId,
        name: a.name,
        albumCount: a.albumCount,
      })),
      battles: r.battles,
      userCount: r.userCount,
      finished: r.finished,
      finishRate: r.battles ? Math.round((r.finished / r.battles) * 100) : 0,
      lastAt: r.lastAt,
      adopted: sysKeys.has(r.key),
    })),
  };
}

function assertCanManage(user, combo) {
  const isOwner = combo.ownerId && String(combo.ownerId) === String(user._id);
  const isSystemAdmin = combo.isSystem && user.role === 'admin';
  if (!isOwner && !isSystemAdmin) throw new ForbiddenError('只能维护自己的组合（系统组合仅管理员可改）');
}

export async function createCombo(user, payload) {
  const wantSystem = Boolean(payload.isSystem);
  if (wantSystem && user.role !== 'admin') throw new ForbiddenError('只有管理员能维护系统组合');
  const artists = (payload.artists || []).map((a) => ({
    artistId: a.artistId,
    name: a.name || String(a.artistId),
    albumCount: Number(a.albumCount) || Number(payload.perArtist) || 8,
  }));
  if (artists.length < 2) throw new BadRequestError('一个组合至少要 2 位歌手');

  const combo = await Combo.create({
    label: String(payload.label).trim(),
    scopeType: payload.scopeType || 'multi-artist',
    artists,
    perArtist: Number(payload.perArtist) || 8,
    alignCount: payload.alignCount ?? null,
    ownerId: wantSystem ? null : user._id,
    isSystem: wantSystem,
  });
  return serialize(combo);
}

export async function updateCombo(user, id, payload) {
  const combo = await Combo.findById(id);
  if (!combo) throw new NotFoundError('组合');
  assertCanManage(user, combo);
  if (payload.label !== undefined) combo.label = String(payload.label).trim();
  if (payload.perArtist !== undefined) combo.perArtist = Number(payload.perArtist);
  await combo.save();
  return serialize(combo);
}

export async function deleteCombo(user, id) {
  const combo = await Combo.findById(id);
  if (!combo) throw new NotFoundError('组合');
  assertCanManage(user, combo);
  await Combo.deleteOne({ _id: combo._id });
  return true;
}

export default { listCombos, createCombo, updateCombo, deleteCombo };
