/**
 * 听感题音频白名单灌库（2026-09-24 第十七批）
 * ============================================================
 * 背景（verify-personality-runtime 抓到的真 bug）：
 *   「音频流派与题目气质标签匹配率 ≥ 90%」实测只有 77%（23/30），抽样全是 `rhythm→流行樂`。
 *   原因：resolveAudio 的最高优先来源 AUDIO_WHITELIST（人工挑的气质代表专辑）**没入库**，
 *   命中不到就退回流派定向 → 流行樂 → 气质对不上（10.4 用户最担心的就是这个）。
 * 做法：把 AUDIO_WHITELIST 里每位歌手按名字去 iTunes 搜 → syncArtist 整碟入库；
 *   入库后回读库里有没有白名单点名的专辑名，逐条报告命中率。
 * 用法：node scripts/seed-audio-whitelist.mjs   （需本地 mongod + 外网）
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { Artist, Album } from '../src/models/index.js';
import { AUDIO_WHITELIST } from '../src/data/personality.js';
import { sameArtistName } from '../src/data/genreWhitelist.js';
import * as itunes from '../src/modules/music/itunes.client.js';
import * as musicService from '../src/modules/music/music.service.js';

await connectDb();

const wanted = [];
for (const [tag, list] of Object.entries(AUDIO_WHITELIST)) {
  for (const item of list) wanted.push({ tag, artist: item.artist, album: item.album });
}
const byArtist = new Map();
for (const w of wanted) {
  if (!byArtist.has(w.artist)) byArtist.set(w.artist, []);
  byArtist.get(w.artist).push(w);
}
console.log(`听感题白名单：${wanted.length} 张（去重后 ${byArtist.size} 位歌手）`);

let ok = 0;
const failed = [];
for (const [artistName, items] of byArtist) {
  try {
    // 已在库里就不再打搜索
    const all = await Artist.find({}).select('artistId name albumCount aliases').lean();
    let doc = all.find((a) => sameArtistName(a.name, artistName) || (a.aliases || []).some((x) => sameArtistName(x, artistName)));
    if (!doc) {
      // eslint-disable-next-line no-await-in-loop
      const { artists } = await itunes.searchArtists(artistName, 5);
      const hit = (artists || []).find((a) => sameArtistName(a.name, artistName)) || (artists || [])[0];
      if (!hit) {
        failed.push(`${artistName}（音乐源搜不到）`);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await musicService.syncArtist(hit.artistId);
      // eslint-disable-next-line no-await-in-loop
      await Artist.updateOne({ artistId: hit.artistId }, { $addToSet: { aliases: artistName } });
      // eslint-disable-next-line no-await-in-loop
      doc = await Artist.findOne({ artistId: hit.artistId }).select('artistId name').lean();
    } else {
      // 已在库：也确保专辑同步过（幂等，syncArtist 会按 artistId 判重）
      // eslint-disable-next-line no-await-in-loop
      await musicService.syncArtist(doc.artistId);
    }
    // 回读：白名单点名的专辑在不在库里（按专辑名模糊比对）
    // eslint-disable-next-line no-await-in-loop
    const albums = await Album.find({ artistExternalId: doc.artistId }).select('name').lean();
    for (const item of items) {
      const needle = item.album.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
      const hit = albums.some((al) => String(al.name).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').includes(needle));
      if (hit) ok += 1;
      else failed.push(`${item.tag}:${item.artist}《${item.album}》（库里 ${albums.length} 张里没对上）`);
    }
    console.log(`  ${doc.name}：库 ${albums.length} 张 · 白名单点名 ${items.length} 张`);
  } catch (e) {
    failed.push(`${artistName}（${e?.message || '同步失败'}）`);
  }
}

console.log(`\n===== 听感题音频白名单灌库：点名 ${wanted.length} 张，库里能对上 ${ok} 张 =====`);
if (failed.length) {
  console.log(`未命中 ${failed.length} 张（resolveAudio 会退回流派定向，建议人工确认）：`);
  console.log('  ' + failed.slice(0, 30).join('\n  '));
}
await disconnectDb();
process.exit(0);
