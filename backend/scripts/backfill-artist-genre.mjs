/**
 * 回填：给已缓存歌手 / 专辑补 iTunes 流派标签（genre）
 * ------------------------------------------------------------
 * 背景：syncArtist 之前从不写 genre → Artist.genre 全是 null，
 *       「按流派建对决」100% 查不到歌手（2026-09-18 修复落库后，新缓存才有）。
 * 本脚本给历史数据补一次：逐位歌手调 iTunes lookup，从专辑结果里取
 * primaryGenreName，回写 Artist.genre 与 Album.genre。
 * 幂等：只补空值；每位歌手间隔 300ms 防限流。
 *
 * 用法：node scripts/backfill-artist-genre.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
// ⚠️ 必须在 import 业务模块之前把 backend/.env 读进来（无论从哪个目录执行）：
//    src/config/index.js 在被 import 时就校验 MONGODB_URI，读不到直接抛错。
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url) });

const { Artist, Album } = await import('../src/models/index.js');
const itunes = await import('../src/modules/music/itunes.client.js');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge';
await mongoose.connect(uri);

const artists = await Artist.find({
  $or: [{ genre: null }, { genre: { $exists: false } }],
}).select('artistId name');

console.log(`· 待回填歌手 ${artists.length} 位`);
let ok = 0;
let miss = 0;
let fail = 0;

for (const a of artists) {
  try {
    const { albums } = await itunes.lookupAlbums(a.artistId);
    const genre = albums.find((x) => x.genre)?.genre || null;
    if (genre) {
      await Artist.updateOne({ artistId: a.artistId }, { $set: { genre } });
      const r = await Album.updateMany(
        { artistExternalId: a.artistId, $or: [{ genre: null }, { genre: { $exists: false } }] },
        { $set: { genre } },
      );
      ok += 1;
      console.log(`  ✓ ${a.name} → ${genre}（专辑补 ${r.modifiedCount || 0} 张）`);
    } else {
      miss += 1;
      console.log(`  · ${a.name}：iTunes 未返回流派`);
    }
  } catch (err) {
    fail += 1;
    console.log(`  ✗ ${a.name}：${err.message}`);
  }
  // 300ms 间隔：iTunes 无密钥但有限流，别把自己打挂
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`· 回填完成：成功 ${ok}，未取到 ${miss}，失败 ${fail}`);
await mongoose.disconnect();
