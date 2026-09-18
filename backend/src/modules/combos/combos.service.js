/**
 * 歌手组合服务
 * ------------------------------------------------------------
 * 「常用组合」与「我收藏组合」共用一张表：
 *   · 系统组合（isSystem）→ 管理员维护，所有人可见；
 *   · 用户组合（ownerId）→ 本人维护，只有本人看得到。
 * 权限口径：系统组合只有管理员能改；用户组合只有本人能改（管理员也不越权改别人的私人组合）。
 */
import { Combo } from '../../models/index.js';
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

/** 我可以看到的组合 = 系统组合 + 我自己建的（系统组合排在前面） */
export async function listCombos(user) {
  const list = await Combo.find({ $or: [{ isSystem: true }, { ownerId: user._id }] }).sort({
    isSystem: -1,
    createdAt: -1,
  });
  return { list: list.map(serialize) };
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
