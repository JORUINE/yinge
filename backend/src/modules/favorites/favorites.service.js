/**
 * 收藏与分享服务
 * 对应接口：U-01 ~ U-05
 */
import { Favorite, ShareCard, Album, PersonalityType } from '../../models/index.js';
import { NotFoundError, BadRequestError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/http.js';
import { serializeAlbum } from '../music/music.service.js';

export async function addFavorite(userId, { targetType, targetId }) {
  // 目标存在性校验
  if (targetType === 'album') {
    if (!(await Album.exists({ _id: targetId }))) throw new BadRequestError('专辑不存在');
  } else if (!(await PersonalityType.exists({ _id: targetId }))) {
    throw new BadRequestError('人格类型不存在');
  }
  // ⚠️ 幂等：已经收藏过就直接当成功返回。
  //   以前直接 create，重复时会撞唯一索引，被全局错误处理成「记录已存在，请勿重复操作」红字 ——
  //   而收藏按钮本质是"切换"，重复点/状态没同步时就会莫名报错（用户报的"刷新后又报错"）。
  const existing = await Favorite.findOne({ userId, targetType, targetId });
  if (existing) return { favoriteId: String(existing._id), already: true };
  const doc = await Favorite.create({ userId, targetType, targetId });
  return { favoriteId: String(doc._id) };
}

export async function removeFavorite(userId, targetId) {
  const res = await Favorite.deleteOne({ userId, targetId });
  if (!res.deletedCount) throw new NotFoundError('收藏记录');
  return true;
}

export async function listFavorites(userId, query) {
  const { page, pageSize, skip, limit } = parsePagination(query);
  const filter = { userId };
  if (query.targetType) filter.targetType = query.targetType;
  const [list, total] = await Promise.all([
    Favorite.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Favorite.countDocuments(filter),
  ]);

  const albumIds = list.filter((f) => f.targetType === 'album').map((f) => f.targetId);
  const typeIds = list.filter((f) => f.targetType === 'personality_type').map((f) => f.targetId);
  const [albums, types] = await Promise.all([
    Album.find({ _id: { $in: albumIds } }),
    PersonalityType.find({ _id: { $in: typeIds } }),
  ]);
  const albumMap = new Map(albums.map((a) => [String(a._id), a]));
  const typeMap = new Map(types.map((t) => [String(t._id), t]));

  return {
    list: list.map((f) => {
      const target = f.targetType === 'album' ? albumMap.get(String(f.targetId)) : typeMap.get(String(f.targetId));
      return {
        favoriteId: String(f._id),
        targetType: f.targetType,
        targetId: String(f.targetId),
        createdAt: f.createdAt,
        // 专辑统一走 serializeAlbum（与全站同形状，并带上本地 id）
        target: target ? (f.targetType === 'album' ? serializeAlbum(target) : target) : null,
      };
    }),
    page,
    pageSize,
    total,
  };
}

export async function addShareCard(userId, { type, refId, imageUrl }) {
  const doc = await ShareCard.create({ userId, type, refId, imageUrl });
  return { shareCardId: String(doc._id), imageUrl: doc.imageUrl };
}

export async function listShareCards(userId, query) {
  const { page, pageSize, skip, limit } = parsePagination(query);
  const filter = { userId };
  if (query.type) filter.type = query.type;
  const [list, total] = await Promise.all([
    ShareCard.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ShareCard.countDocuments(filter),
  ]);
  return {
    list: list.map((s) => ({
      shareCardId: String(s._id),
      type: s.type,
      refId: String(s.refId),
      imageUrl: s.imageUrl,
      createdAt: s.createdAt,
    })),
    page,
    pageSize,
    total,
  };
}

export default { addFavorite, removeFavorite, listFavorites, addShareCard, listShareCards };
