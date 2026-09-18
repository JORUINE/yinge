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

/**
 * 专辑「夺冠次数」榜（2026-09-19 用户要求新增）
 * ------------------------------------------------------------
 * 口径：一张专辑**当过多少次冠军** —— 只统计 `status=finished` 且冠军已决出的对局，
 * 同一张专辑在多局里夺冠就累加（"最受欢迎"是票数，"能打"是夺冠次数，两个口径互补）。
 * 并列时按最近一次夺冠时间排（越新越靠前），再按 _id 兜底，保证结果稳定可复现。
 */
export async function championsRank({ limit = 20, skip = 0 } = {}) {
  const rows = await Battle.aggregate([
    { $match: { status: 'finished', championAlbumId: { $ne: null } } },
    { $group: { _id: '$championAlbumId', titles: { $sum: 1 }, lastWinAt: { $max: '$createdAt' } } },
    { $sort: { titles: -1, lastWinAt: -1, _id: 1 } },
    { $skip: skip },
    { $limit: limit },
    { $lookup: { from: 'albums', localField: '_id', foreignField: '_id', as: 'album' } },
    { $unwind: '$album' },
    { $lookup: { from: 'artists', localField: 'album.artistId', foreignField: '_id', as: 'artist' } },
  ]);

  return rows.map((row, index) => ({
    rank: skip + index + 1,
    titles: row.titles,
    lastWinAt: row.lastWinAt,
    artistName: row.artist?.[0]?.name || null,
    ...musicService.serializeAlbum(row.album),
  }));
}

/** 夺冠榜单的"共多少张"（不同冠军专辑数），供前端展示口径 */
export async function championsCount() {
  const rows = await Battle.aggregate([
    { $match: { status: 'finished', championAlbumId: { $ne: null } } },
    { $group: { _id: '$championAlbumId' } },
    { $count: 'n' },
  ]);
  return rows[0]?.n || 0;
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

export default { albumsRank, championsRank, championsCount, home };
