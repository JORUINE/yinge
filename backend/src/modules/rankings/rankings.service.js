/**
 * 排行榜服务
 * 对应接口：R-01 专辑榜 / R-02 首页聚合
 * 铁律：所有票数统计都必须带 isInvalid=false，异常票不计入榜单。
 */
import { Vote, Battle, PersonalityResult } from '../../models/index.js';
import * as musicService from '../music/music.service.js';

export async function albumsRank({ limit = 20, skip = 0 } = {}) {
  const rows = await Vote.aggregate([
    { $match: { isInvalid: false } },
    { $group: { _id: '$albumId', votes: { $sum: 1 } } },
    { $sort: { votes: -1, _id: 1 } },
    { $skip: skip },
    { $limit: limit },
    { $lookup: { from: 'albums', localField: '_id', foreignField: '_id', as: 'album' } },
    { $unwind: '$album' },
    { $lookup: { from: 'artists', localField: 'album.artistId', foreignField: '_id', as: 'artist' } },
  ]);

  return rows.map((row, index) => ({
    rank: skip + index + 1,
    votes: row.votes,
    artistName: row.artist?.[0]?.name || null,
    ...musicService.serializeAlbum(row.album),
  }));
}

export async function home() {
  const [topAlbums, playingBattles, finishedBattles, typeRows, totalVotes] = await Promise.all([
    albumsRank({ limit: 10 }),
    Battle.countDocuments({ status: 'playing' }),
    Battle.countDocuments({ status: 'finished' }),
    PersonalityResult.aggregate([
      { $group: { _id: '$typeCode', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    Vote.countDocuments({ isInvalid: false }),
  ]);

  return {
    topAlbums,
    stats: { playingBattles, finishedBattles, totalVotes },
    typeStats: typeRows.map((r) => ({ typeCode: r._id, count: r.count })),
  };
}

export default { albumsRank, home };
