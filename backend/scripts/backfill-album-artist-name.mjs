/**
 * 回填：把已缓存专辑的 artistName 补上
 * ------------------------------------------------------------
 * 背景：卡片要显示「周杰伦 · 2001」，之前 Album 没存 artistName。
 * 已新增该字段并在 syncArtist 写入；本脚本给历史数据补一次。
 * 幂等：只补空值。
 *
 * 用法：node scripts/backfill-album-artist-name.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Album, Artist } from '../src/models/index.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge';
await mongoose.connect(uri);

const artists = await Artist.find({}).select('artistId name');
let total = 0;
for (const a of artists) {
  const res = await Album.updateMany(
    {
      artistExternalId: a.artistId,
      $or: [{ artistName: '' }, { artistName: null }, { artistName: { $exists: false } }],
    },
    { $set: { artistName: a.name } },
  );
  total += res.modifiedCount || 0;
}
const left = await Album.countDocuments({ $or: [{ artistName: '' }, { artistName: null }] });
console.log(`· 回填 ${total} 张专辑的 artistName（共 ${artists.length} 位歌手）；仍为空 ${left} 张`);
await mongoose.disconnect();
