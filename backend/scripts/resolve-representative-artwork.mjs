/**
 * 临时脚本（收官）：为「人格 · 同型代表作」解析真实封面
 *   ① 本地曲库优先（与全站同口径），要求歌手匹配
 *   ② 库里没有 → iTunes 搜索回退，**强制歌手匹配** + 名字最贴近 + 排除 Live/EP/Tribute
 *   ③ 条目本身是"歌不是专辑"（遇見/後來）→ 用 entity=song 的所属专辑封面
 * 限流纪律：并发 2 + 350ms 间隔
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { Album } from '../src/models/index.js';

const REPS = {
  MEL: [
    ['周杰倫', '范特西'],
    ['The Beatles', 'Abbey Road'],
    ['孫燕姿', '遇見'],
    ['Adele', '21'],
  ],
  RHY: [
    ['Michael Jackson', 'Thriller'],
    ['Bruno Mars', '24K Magic'],
    ['Dua Lipa', 'Future Nostalgia'],
  ],
  LYR: [
    ['李健', '似水流年'],
    ['羅大佑', '之乎者也'],
    ['陳綺貞', '華麗的冒險'],
    ['劉若英', '後來'],
  ],
  TMB: [
    ['Radiohead', 'OK Computer'],
    ['Björk', 'Homogenic'],
    ['Tame Impala', 'Currents'],
    ['王力宏', '蓋世英雄'],
  ],
  CLM: [
    ['王菲', '寓言'],
    ['Joni Mitchell', 'Blue'],
    ['Max Richter', 'Sleep'],
    ['Ludovico Einaudi', 'Divenire'],
  ],
  EXP: [
    ['Daft Punk', 'Discovery'],
    ['Arctic Monkeys', 'AM'],
    ['Kendrick Lamar', 'good kid, m.A.A.d city'],
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-—_()（）[\]·.,'’!?：:]/g, '');
const BAD = /(live|b-?sides|remix|tribute|karaoke|instrumental|acoustic|unplugged|piano edition|精選|精选|演唱會|演唱会|合輯|合辑)/i;

function artistMatch(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y || x.length < 2 || y.length < 2) return false;
  return x === y || x.includes(y) || y.includes(x);
}

await connectDb();
const all = await Album.find({}).select('name artistName artworkUrl').lean();
console.log('曲库专辑总数:', all.length);

async function itunesSearch(term, entity, country, limit = 25) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=${limit}&country=${country}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return j?.results || [];
}

const to600 = (u) => (u ? u.replace(/\/\d+x\d+bb\.(jpg|png)/, '/600x600bb.$1') : '');

/** 本地库命中 */
function localLookup(artist, album) {
  const k = norm(album);
  const pool = all.filter((a) => artistMatch(a.artistName, artist));
  let best = null;
  let bestScore = 0;
  for (const a of pool) {
    const n = norm(a.name);
    let sc = 0;
    if (n === k) sc = 100;
    else if (n.startsWith(k) && k.length >= 3) sc = 70;
    else if (n.includes(k) && k.length >= 4) sc = 50;
    if (BAD.test(a.name)) sc -= 25;
    if (sc > bestScore) {
      bestScore = sc;
      best = a;
    }
  }
  return best && bestScore > 0 ? { url: best.artworkUrl, got: `${best.artistName} / ${best.name}`, src: 'local' } : null;
}

/** iTunes 回退（强制歌手匹配） */
async function itunesLookup(artist, album) {
  let best = null;
  let bestScore = 0;
  let bestGot = '';
  for (const country of ['us', 'hk']) {
    for (const entity of ['album', 'song']) {
      // eslint-disable-next-line no-await-in-loop
      const list = await itunesSearch(`${album} ${artist}`, entity, country);
      for (const r of list) {
        if (!r.artworkUrl100) continue;
        const rArtist = r.artistName || '';
        if (!artistMatch(rArtist, artist)) continue; // ★ 强制歌手匹配
        const name = entity === 'album' ? r.collectionName : r.trackName;
        if (entity === 'song' && norm(name) !== norm(album)) continue; // 歌曲要求歌名全等
        const raw = entity === 'album' ? r.collectionName : r.collectionName || '';
        let sc = 0;
        const n = norm(raw);
        const k = norm(album);
        if (entity === 'song') sc = 88;
        else if (n === k) sc = 100;
        else if (n.startsWith(k) && k.length >= 3) sc = 70;
        else if (n.includes(k) && k.length >= 4) sc = 50;
        else continue;
        if (entity === 'album') sc += Math.min(r.trackCount || 0, 40) / 8;
        if (BAD.test(raw)) sc -= 40;
        if (/-?\s*Single$/i.test(raw)) sc -= 30;
        if (/\bEP\b/i.test(raw)) sc -= 25;
        if (sc > bestScore) {
          bestScore = sc;
          best = r;
          bestGot = `${raw} · ${r.trackCount ?? 0}首 · ${rArtist}`;
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(340);
      if (bestScore >= 100) break;
    }
    if (bestScore >= 100) break;
  }
  return best ? { url: to600(best.artworkUrl100), got: bestGot, src: 'itunes' } : null;
}

const out = {};
const misses = [];
const jobs = [];
for (const [type, list] of Object.entries(REPS)) {
  out[type] = [];
  for (const [artist, album] of list) jobs.push({ type, artist, album });
}
// 本地库先跑（同步、零网络）
const needNet = [];
for (const job of jobs) {
  const hit = localLookup(job.artist, job.album);
  if (hit) {
    out[job.type].push({ ...job, ...hit });
    console.log(`✅[local] ${job.type} ${job.artist}《${job.album}》 → ${hit.got}`);
  } else {
    needNet.push(job);
  }
}
// 网络回退（并发 2）
let idx = 0;
async function worker() {
  while (idx < needNet.length) {
    const job = needNet[idx];
    idx += 1;
    // eslint-disable-next-line no-await-in-loop
    const hit = await itunesLookup(job.artist, job.album);
    out[job.type].push({ ...job, ...(hit || { url: '', got: '未命中', src: 'none' }) });
    if (!hit) misses.push(`${job.artist}《${job.album}》`);
    console.log(`${hit ? '✅[itunes]' : '❌'} ${job.type} ${job.artist}《${job.album}》 → ${hit ? hit.got : '未命中'}`);
  }
}
await Promise.all([worker(), worker()]);

// 按原顺序重排输出
console.log('\n===== 可粘贴片段 =====');
for (const [type, list] of Object.entries(REPS)) {
  console.log(`  ${type}: [`);
  for (const [artist, album] of list) {
    const e = out[type].find((x) => x.artist === artist && x.album === album);
    console.log(`    { artist: '${artist}', album: '${album}', artworkUrl: '${e?.url || ''}' },`);
  }
  console.log('  ],');
}
console.log('\n未命中:', misses.length, misses.join('、'));
await disconnectDb();
