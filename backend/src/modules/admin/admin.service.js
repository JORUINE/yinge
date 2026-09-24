/**
 * 后台管理服务
 * 对应接口：D-01 ~ D-14
 */
import {
  User,
  PersonalityQuestion,
  PersonalityType,
  Artist,
  Album,
  Battle,
  PersonalityResult,
  Vote,
} from '../../models/index.js';
import { BANNED_REASONS } from '../../models/User.js';
import { ForbiddenError, NotFoundError, BadRequestError, DuplicateError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/http.js';
import * as authService from '../auth/auth.service.js';
import * as musicService from '../music/music.service.js';
import * as itunes from '../music/itunes.client.js';
import { canonicalGenreKey } from '../../data/genreWhitelist.js';
// ⚠️ 2026-09-25：`skipArtist` 与 `whitelistOfGenre` 都按名导入。
// 原来 listGenreArtists 写的 `genreExpand.whitelistOfGenre(...)`，但**没有** genreExpand 这个命名空间
// → GET /admin/genre-artists 一调就 ReferenceError → 500（前端表现为"该流派现有：读取中…"永不结束）。
import { skipArtist, whitelistOfGenre } from '../music/genreExpand.js';

export async function login({ account, password }) {
  const result = await authService.login({ account, password });
  const user = await User.findOne({ account: account.toLowerCase() });
  if (user.role !== 'admin') throw new ForbiddenError('该账号不是管理员');
  return result;
}

export async function dashboard() {
  const [userTotal, bannedTotal, battleTotal, albumTotal, artistTotal, resultTotal, voteTotal, topAlbumRows, genreRows, artistRows] =
    await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ status: 'banned' }),
      Battle.countDocuments(),
      Album.countDocuments(),
      Artist.countDocuments(),
      PersonalityResult.countDocuments(),
      Vote.countDocuments({ isInvalid: false }),
      // 用户投出来的专辑 Top10（只算有效票 —— 榜单铁律：统计口径必须 isInvalid=false）
      Vote.aggregate([
        { $match: { isInvalid: false } },
        { $group: { _id: '$albumId', votes: { $sum: 1 } } },
        { $sort: { votes: -1 } },
        { $limit: 10 },
        {
          $lookup: { from: 'albums', localField: '_id', foreignField: '_id', as: 'album' },
        },
        { $unwind: '$album' },
        {
          $project: {
            votes: 1,
            name: '$album.name',
            artistName: '$album.artistName',
            albumId: '$album.albumId',
          },
        },
      ]),
      // 专辑偏好 · 按流派分布（Album.genre 来自 iTunes 歌手流派标签，2026-09-18 起才有数据）
      Vote.aggregate([
        { $match: { isInvalid: false } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: '_id', as: 'album' } },
        { $unwind: '$album' },
        { $group: { _id: { $ifNull: ['$album.genre', '未知'] }, votes: { $sum: 1 } } },
        { $sort: { votes: -1 } },
        { $limit: 8 },
      ]),
      // 专辑偏好 · 按歌手分布
      Vote.aggregate([
        { $match: { isInvalid: false } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: '_id', as: 'album' } },
        { $unwind: '$album' },
        { $group: { _id: '$album.artistName', votes: { $sum: 1 } } },
        { $sort: { votes: -1 } },
        { $limit: 8 },
      ]),
    ]);
  const typeRows = await PersonalityResult.aggregate([
    { $group: { _id: '$typeCode', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 8 },
  ]);
  return {
    users: { total: userTotal, banned: bannedTotal },
    battles: { total: battleTotal },
    music: { artists: artistTotal, albums: albumTotal },
    results: { total: resultTotal },
    votes: { valid: voteTotal },
    typeStats: typeRows.map((r) => ({ typeCode: r._id, count: r.count })),
    // ↓ 新增：排行投票 / 用户专辑倾向（2026-09-18 用户要求管理员能看见"大家投了什么"）
    topAlbums: topAlbumRows.map((r) => ({
      name: r.name,
      artistName: r.artistName,
      votes: r.votes,
      albumId: r.albumId,
    })),
    genreAffinity: genreRows.map((r) => ({ genre: r._id, votes: r.votes })),
    artistAffinity: artistRows.map((r) => ({ artist: r._id, votes: r.votes })),
  };
}

// ---- 题目管理 ----
export async function listQuestions() {
  /**
   * ⚠️ 2026-09-25 修（用户："题目这里我只要修改点保存就会出现这个 Bug"）：
   * 原来直接返回 mongoose 文档，**只有 `_id`、没有 `questionId`**；
   * 而前端 AdminQuestionsView 三处都在用 `q.questionId`（`v-for :key` / `openEdit` / `deleteQuestion`）。
   * 后果链：`editing.value = q.questionId` → undefined → 保存时 `if (editing.value)` 判假 →
   * **走"新建"分支** → 后端撞 order 唯一 → 弹「题号 49 已存在」（用户截图里的报错）。
   * 删除同理（DELETE /admin/questions/undefined）。
   * 这里统一序列化出 `questionId`，三处一起修好。
   */
  const list = await PersonalityQuestion.find().sort({ order: 1 }).lean();
  return list.map((q) => ({ ...q, questionId: String(q._id) }));
}

/**
 * 清洗选项分数（2026-09-25）
 * ------------------------------------------------------------
 * 用户报"修改题目点保存就报 bug"：PUT 报 `options.4.score Required`。
 * 真因有两层：
 *   ① zod 的 `questionUpdateSchema = questionSchema.partial()` **只让顶层字段可选**，
 *      嵌套的 `optionSchema.score` 仍是必填（写法陷阱）；
 *   ② 而"说不上来"这种**中立出口选项本来就没有分数**（10.1 的负向/中立设计），
 *      旧题里也确实存在没有 score 键的选项。
 * 两头一起修：schema 侧把 score 放宽（见 admin.routes.js），这里再把 null / 非数字键**清掉**，
 * 保证落库的是干净的 `{维度:数字}`。
 */
function cleanOptions(options = []) {
  return (options || []).map((o) => ({
    key: o.key,
    label: o.label,
    score: Object.fromEntries(
      Object.entries(o.score || {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)),
    ),
  }));
}

export async function createQuestion(data) {
  const exists = await PersonalityQuestion.exists({ order: data.order });
  if (exists) throw new DuplicateError(`题号 ${data.order} 已存在`);
  return PersonalityQuestion.create({ ...data, options: cleanOptions(data.options) });
}

export async function updateQuestion(id, data) {
  const patch = { ...data };
  if (patch.options) patch.options = cleanOptions(patch.options);
  const doc = await PersonalityQuestion.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!doc) throw new NotFoundError('题目');
  return doc;
}

export async function deleteQuestion(id) {
  const res = await PersonalityQuestion.deleteOne({ _id: id });
  if (!res.deletedCount) throw new NotFoundError('题目');
  return true;
}

// ---- 人格类型管理 ----
export async function listTypes() {
  const types = await PersonalityType.find().sort({ code: 1 }).lean();
  // 2026-09-20：顺手把已绑的推荐专辑取出来（后台"绑定推荐专辑"要回填名称与封面）。
  // 前端人格卡一直空着「常听专辑」，就是因为后台以前没有绑定入口。
  const ids = types.flatMap((t) => t.recommendAlbumIds || []);
  const albums = ids.length ? await Album.find({ _id: { $in: ids } }).lean() : [];
  const byId = new Map(albums.map((a) => [String(a._id), a]));
  return types.map((t) => ({
    ...t,
    recommendAlbums: (t.recommendAlbumIds || [])
      .map((id) => {
        const a = byId.get(String(id));
        if (!a) return null;
        return {
          id: String(a._id),
          albumId: a.albumId,
          name: a.name,
          artistName: a.artistName || '',
          artworkUrl: a.artworkUrl,
          releaseDate: a.releaseDate,
        };
      })
      .filter(Boolean),
  }));
}

export async function createType(data) {
  const exists = await PersonalityType.exists({ code: data.code });
  if (exists) throw new DuplicateError(`类型码 ${data.code} 已存在`);
  return PersonalityType.create(data);
}

export async function updateType(id, data) {
  const doc = await PersonalityType.findByIdAndUpdate(id, { $set: data }, { new: true });
  if (!doc) throw new NotFoundError('人格类型');
  return doc;
}

export async function deleteType(id) {
  const res = await PersonalityType.deleteOne({ _id: id });
  if (!res.deletedCount) throw new NotFoundError('人格类型');
  return true;
}

// ---- 音乐数据管理 ----
export async function listMusic(query) {
  const { page, pageSize, skip, limit } = parsePagination(query);
  const filter = {};
  if (query.keyword) filter.name = new RegExp(String(query.keyword), 'i');
  const [list, total] = await Promise.all([
    Artist.find(filter).sort({ cachedAt: -1 }).skip(skip).limit(limit),
    Artist.countDocuments(filter),
  ]);
  return {
    list: list.map((a) => ({
      artistId: a.artistId,
      name: a.name,
      genre: a.genre,
      region: a.region,
      albumCount: a.albumCount,
      cachedAt: a.cachedAt,
      freshness: musicService.freshness(a.cachedAt),
    })),
    page,
    pageSize,
    total,
  };
}

export async function refreshMusic({ artistId }) {
  const result = await musicService.syncArtist(artistId);
  return { artistId: Number(artistId), albums: result.albums.length, stats: result.stats };
}

// ---- 流派歌手手动管理（2026-09-24 第十七批）----
/**
 * 管理员给某个流派手动加歌手：搜音乐源 → 专辑入库 → 记录"该歌手属于这个流派"。
 * 用户原话："在管理员后台加上我可以给每个流派手动添加歌手然后把它的专辑入库，
 * 就和推荐专辑那里我也可以自己搜一样"。
 */
export async function addGenreArtist({ genre, q }) {
  const term = String(q || '').trim();
  if (!term) throw new BadRequestError('请输入歌手名');
  const key = canonicalGenreKey(genre);
  if (!key) throw new BadRequestError(`「${genre}」不是可用的流派`);
  const { artists } = await itunes.searchArtists(term, 5);
  const hit =
    (artists || []).find((a) => !skipArtist(a.name, genre)) || (artists || [])[0];
  if (!hit) throw new BadRequestError(`音乐源里没找到「${term}」，换个写法试试`);
  // 专辑入库（含准入过滤）
  const result = await musicService.syncArtist(hit.artistId);
  // 记录流派归属 + 把搜索词记成别名（ hk 区本地化名也能对上）
  const doc = await Artist.findOneAndUpdate(
    { artistId: hit.artistId },
    { $addToSet: { curatedGenres: key, aliases: term } },
    { new: true },
  )
    .select('artistId name albumCount curatedGenres')
    .lean();
  return {
    artistId: hit.artistId,
    name: doc?.name || hit.artistName,
    importedAlbums: result.albums.length,
    albumCount: doc?.albumCount || 0,
    curatedGenres: doc?.curatedGenres || [key],
  };
}

/** 某个流派当前的歌手名单（白名单 + 管理员手动加的），供后台核对 */
export async function listGenreArtists({ genre }) {
  return whitelistOfGenre(genre);
}

// ---- 用户管理 ----
export async function listUsers(query) {
  const { page, pageSize, skip, limit } = parsePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.keyword) {
    const re = new RegExp(String(query.keyword), 'i');
    filter.$or = [{ account: re }, { nickname: re }];
  }
  const [list, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return {
    list: list.map((u) => u.toSafeJSON()),
    page,
    pageSize,
    total,
    bannedReasons: BANNED_REASONS,
  };
}

export async function updateUserStatus(id, { status, bannedReason = null, bannedNote = null }, adminId) {
  const user = await User.findById(id);
  if (!user) throw new NotFoundError('用户');
  if (status === 'banned') {
    if (bannedReason && !BANNED_REASONS.includes(bannedReason)) {
      throw new BadRequestError('禁用原因不在允许的枚举范围内');
    }
    user.status = 'banned';
    user.bannedReason = bannedReason;
    user.bannedNote = bannedNote;
    user.bannedAt = new Date();
    user.bannedBy = adminId;
  } else {
    user.status = 'active';
    user.bannedReason = null;
    user.bannedNote = null;
    user.bannedAt = null;
    user.bannedBy = null;
    user.restrictUntil = null;
  }
  await user.save();
  return user.toSafeJSON();
}

export default {
  login,
  dashboard,
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  listTypes,
  createType,
  updateType,
  deleteType,
  listMusic,
  refreshMusic,
  addGenreArtist,
  listGenreArtists,
  listUsers,
  updateUserStatus,
};
