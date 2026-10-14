#!/usr/bin/env node
/**
 * 第三十九批（续五）· 语种筛选漏筛诊断
 * ------------------------------------------------------------------
 * 用户 2026-10-14 晚间复现：选「华语区 + 全部语种」，池子里出现
 *   · 平克勞斯貝（= Bing Crosby）
 *   · Jamie xx（英国电子音乐人）
 * 我上一轮用 1990-2000 测**没复现**，用户这局是 **2025-2026** —— 差别在年代，
 * 所以这里按用户的真实参数重跑，并把每位歌手的**判定依据**一起打出来。
 *
 * 用法：node scripts/diag-language-leak.mjs [起始年] [结束年] [档位]
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const { resolvePool } = await import('../src/modules/battles/battle.service.js');
const { languageTagOf } = await import('../src/data/languageTag.js');
const { Artist } = await import('../src/models/index.js');

await mongoose.connect(process.env.MONGODB_URI);

const startYear = Number(process.argv[2]) || 2025;
const endYear = Number(process.argv[3]) || 2026;
const cap = Number(process.argv[4]) || 48;

const r = await resolvePool({ scopeType: 'era', startYear, endYear, zone: 'zh', albumCount: cap });
const docs = await Artist.find({ artistId: { $in: r.artists.map((a) => Number(a.artistId)) } })
  .select('artistId name genre region aliases')
  .lean();
const byId = new Map(docs.map((d) => [Number(d.artistId), d]));

console.log(`\n参数：年代 ${startYear}-${endYear} · 华语区 · 全部语种 · ${cap} 张`);
console.log(`池内 ${r.artists.length} 位歌手 / ${r.albums.length} 张专辑\n`);

const byLang = {};
const leaks = [];
for (const a of r.artists) {
  const d = byId.get(Number(a.artistId)) || {};
  const lang = languageTagOf(d);
  byLang[lang] = (byLang[lang] || 0) + 1;
  if (lang !== 'mandarin' && lang !== 'cantonese') leaks.push({ ...a, lang, d });
}
console.log('语言分布：' + JSON.stringify(byLang));
console.log(`\n非华语（本该被 zone=zh 筛掉）${leaks.length} 位：`);
for (const l of leaks) {
  const d = l.d || {};
  console.log(`  ${String(l.name).padEnd(24)} lang=${String(l.lang).padEnd(9)} genre=${String(d.genre || '(空)').padEnd(20)} region=${d.region || '(空)'}`);
}

// ── 反向排查：找出所有"名字是汉字、其实是欧美歌手"的条目 ──
// 判据：名字含汉字 ⇒ 被判华语；但 genre 是明确的西方流派 ⇒ 存疑
const CJK = /[\u4e00-\u9fff]/;
const WESTERN_GENRE = /Hip-Hop|R&B|騷靈|爵士|古典|鄉村|搖滾|電子|另類|Pop|Rock|Jazz|Classical|Country|Electronic|Metal|Blues|Folk|Soul|Reggae|Funk|Punk|Dance|Indie|Alternative|Latin|World/i;
console.log('\n── 全库排查：名字含汉字 + 流派是西方流派 ⇒ 疑似"译名被误判成华语" ──');
const all = await Artist.find({ name: { $exists: true } }).select('artistId name genre region').lean();
const suspects = all.filter((d) => CJK.test(String(d.name)) && WESTERN_GENRE.test(String(d.genre || '')));
console.log(`  共 ${suspects.length} 位（占全部 ${all.length} 位歌手的 ${(suspects.length / all.length * 100).toFixed(1)}%）`);
// 这些歌手的封面库里有没有歌
const { Album } = await import('../src/models/index.js');
const ids = suspects.map((s) => s.artistId);
const albumsOf = await Album.find({ artistExternalId: { $in: ids }, isEligible: true }).select('artistExternalId').lean();
const withAlbums = new Set(albumsOf.map((a) => Number(a.artistExternalId)));
const real = suspects.filter((s) => withAlbums.has(Number(s.artistId)));
console.log(`  其中"有合格专辑、真能进池"的 ${real.length} 位 —— 这些就是会污染华语区的源头`);
real.slice(0, 25).forEach((s) => console.log(`      ${String(s.name).padEnd(22)} genre=${String(s.genre).padEnd(20)} region=${s.region || '(空)'}`));
if (real.length > 25) console.log(`      …（还有 ${real.length - 25} 位）`);

// ── 规则体检 + 抽样频率 ──
console.log('\n── 抽样频率：同一参数连取 12 次，看有多少次会漏进非华语 ──');
let hitRuns = 0;
let totalLeaks = 0;
for (let i = 0; i < 12; i += 1) {
  const rr = await resolvePool({ scopeType: 'era', startYear, endYear, zone: 'zh', albumCount: 24 });
  const dd = await Artist.find({ artistId: { $in: rr.artists.map((a) => Number(a.artistId)) } })
    .select('artistId name genre region').lean();
  const mp = new Map(dd.map((d) => [Number(d.artistId), d]));
  const bad = rr.artists
    .map((a) => ({ name: a.name, lang: languageTagOf(mp.get(Number(a.artistId)) || {}) }))
    .filter((x) => x.lang !== 'mandarin' && x.lang !== 'cantonese');
  if (bad.length) { hitRuns += 1; totalLeaks += bad.length; }
  process.stdout.write(`  第 ${String(i + 1).padStart(2)} 次：漏 ${bad.length} 位` + (bad.length ? `（${bad.map((b) => b.name).join('、')}）` : '') + '\n');
}
console.log(`\n  ⇒ 12 次里有 ${hitRuns} 次漏进非华语，累计 ${totalLeaks} 位（这是概率性复现）`);

await mongoose.disconnect();
process.exit(leaks.length || real.length ? 1 : 0);
