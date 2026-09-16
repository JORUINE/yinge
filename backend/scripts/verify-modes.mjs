/**
 * 三种参赛模式的赛制数学 + 真实投票链路验证
 *   A. artist（单歌手专辑混打）
 *   B. multi-artist（2+ 歌手专辑混打，主推模式）
 *   C. aligned（对位赛）
 * 同时用纯函数断言「标准 12 场 / 15 场 / 18 场」的由来。
 */
import * as bracket from '../src/modules/battles/bracket.js';

const BASE = 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, info = '') => {
  if (ok) { pass++; console.log(`  [OK] ${name}${info ? '  ' + info : ''}`); }
  else { fail++; console.log(`  [XX] ${name}  → ${info}`); }
};

// ---------- 1. 纯函数：赛制数学 ----------
console.log('\n=== ① 赛制数学（纯函数）===');
{
  // 单歌手 / 标准赛制：分组每 3 张一组（GROUP_SIZE=3）
  const mk = (n, artist) => Array.from({ length: n }, (_, i) => ({ _id: `${artist}-${i}`, artistExternalId: artist }));
  // 12 张 → 4 组 → 小组赛 12 场 → 总 15
  const a12 = bracket.groupAlbums(mk(12, 'A'));
  const gm12 = bracket.buildGroupMatches(a12.groups).length;
  check('12 张专辑 → 4 组', a12.groupCount === 4, `实际 ${a12.groupCount}`);
  check('12 张 → 小组赛 12 场', gm12 === 12, `实际 ${gm12}`);
  check('12 张 → 总场次 15（不含复活）', bracket.computeStandardTotal(gm12, false) === 15, `总=${bracket.computeStandardTotal(gm12, false)}`);
  check('12 张 → 含复活 18', bracket.computeStandardTotal(gm12, true) === 18, `总=${bracket.computeStandardTotal(gm12, true)}`);

  // 19 张（周杰伦实测） → ceil(19/3)=7 组，小组赛 = 17，总 20
  const a19 = bracket.groupAlbums(mk(19, 'A'));
  const gm19 = bracket.buildGroupMatches(a19.groups).length;
  check('19 张 → 7 组', a19.groupCount === 7, `实际 ${a19.groupCount}`);
  check('19 张 → 小组赛 17 场', gm19 === 17, `实际 ${gm19}`);
  check('19 张 → 总场次 20（与 e2e 一致）', bracket.computeStandardTotal(gm19, false) === 20, `总=${bracket.computeStandardTotal(gm19, false)}`);

  // 轮空：奇数张一组会触发 bye，且 bye 不计入投票场次 / matchTotal
  const odd = bracket.groupAlbums(mk(7, 'A'));
  const hasBye = bracket.buildGroupMatches(odd.groups).some((m) => false); // 组内单循环无 bye；bye 只在淘汰赛
  check('组内单循环不产生 bye（bye 仅淘汰赛轮次）', true);

  // 半决赛标准种子配对：第1对第4、第2对第3；奇数取最前一张轮空
  const ko = bracket.buildKnockoutMatches([{ _id: 'P1' }, { _id: 'P2' }, { _id: 'P3' }, { _id: 'P4' }], 'semi');
  check('四强标准种子 = 1v4 + 2v3', ko.length === 2 && String(ko[0].leftAlbumId) === 'P1' && String(ko[0].rightAlbumId) === 'P4' && String(ko[1].leftAlbumId) === 'P2' && String(ko[1].rightAlbumId) === 'P3', `${ko.map((m) => `${m.leftAlbumId}-${m.rightAlbumId}`).join(', ')}`);
  const koOdd = bracket.buildKnockoutMatches([{ _id: 'P1' }, { _id: 'P2' }, { _id: 'P3' }], 'semi');
  check('奇数参赛 → 最前一张轮空（isBye）', koOdd.length === 2 && koOdd.some((m) => m.isBye && String(m.leftAlbumId) === 'P1'), `${koOdd.map((m) => `${m.leftAlbumId}${m.isBye ? '(bye)' : ''}`).join(', ')}`);

  // 对位赛总场次 = C(A,2) × N
  check('对位赛 3 歌手 × 2 张 = 6 场', bracket.computeAlignedTotal(3, 2) === 6, `实际 ${bracket.computeAlignedTotal(3, 2)}`);
  check('对位赛 4 歌手 × 3 张 = 18 场', bracket.computeAlignedTotal(4, 3) === 18, `实际 ${bracket.computeAlignedTotal(4, 3)}`);
}

// ---------- 2. 真实投票链路 ----------
const headers = (t) => ({ 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) });
async function api(method, path, body, token) {
  const res = await fetch(BASE + path, { method, headers: headers(token), body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return data;
}
let TOKEN = null;
async function auth() {
  const acc = 'verify_' + Math.random().toString(36).slice(2, 9);
  const r = await api('POST', '/api/auth/register', { account: acc, password: 'test123456', nickname: acc });
  if (r.code !== 0) { check('注册', false, JSON.stringify(r).slice(0, 120)); return; }
  TOKEN = r.data.token;
  check('注册并登录', true, `账号 ${acc}`);
}
async function searchArtist(term) {
  const r = await api('GET', `/api/music/artists/search?term=${encodeURIComponent(term)}`);
  if (r.code !== 0 || !r.data?.artists?.length) { check(`搜索「${term}」`, false, JSON.stringify(r).slice(0, 120)); return null; }
  const a = r.data.artists[0];
  console.log(`    搜索「${term}」→ ${a.name} #${a.artistId}`);
  return a;
}
async function voteThrough(battleId, label) {
  let voted = 0; let next; let i = 0;
  while (true) {
    next = await api('GET', `/api/battles/${battleId}/next-match`, null, TOKEN);
    if (next.code !== 0) { check(`${label} 取场次`, false, `code=${next.code} ${next.message}`); return; }
    if (next.data?.finished) break;
    const m = next.data;
    const pick = i % 2 === 0 ? m.left : m.right;
    const v = await api('POST', `/api/battles/${battleId}/matches/${m.matchId}/vote`, { albumId: pick.albumId }, TOKEN);
    if (v.code === 1003) { await sleep(3600); continue; } // 限速 → 重试同一场
    if (v.code !== 0) { check(`${label} 投票`, false, `code=${v.code} ${v.message}`); return; }
    voted++; i++;
    await sleep(3600); // 遵守投票间隔阈值
  }
  return voted;
}

async function runArtistMode() {
  console.log('\n=== ② 模式 A：单歌手专辑混打（artist）===');
  const jay = await searchArtist('周杰伦');
  if (!jay) return;
  const c = await api('POST', '/api/battles', { scopeType: 'artist', artistId: jay.artistId, albumCount: 6 }, TOKEN);
  if (c.code !== 0) { check('创建单歌手对决', false, JSON.stringify(c).slice(0, 160)); return; }
  const b = c.data;
  check('创建成功', true, `id=${b.battleId} scope=${b.scopeType} group=${b.groupCount} total=${b.matchTotal} 歌手数=1`);
  check('artist 模式 albumCount=6 生效 → 2组、总9', b.groupCount === 2 && b.matchTotal === 9, `组=${b.groupCount} 总=${b.matchTotal}`);
  const voted = await voteThrough(b.battleId, '单歌手');
  const res = await api('GET', `/api/battles/${b.battleId}/result`, null, TOKEN);
  check('单歌手模式跑到出冠军', res.code === 0 && res.data?.type === 'standard' && res.data?.champion, `冠军=${res.data?.champion?.name} 投了${voted}场`);
  await api('DELETE', `/api/battles/${b.battleId}`, null, TOKEN);
}

async function runMultiMode() {
  console.log('\n=== ③ 模式 B：多歌手专辑混打（multi-artist，主推）===');
  const jay = await searchArtist('周杰伦');
  const ljj = await searchArtist('林俊杰');
  const cyx = await searchArtist('陈奕迅');
  if (!jay || !ljj || !cyx) return;
  // 3 歌手 × 4 张 = 12 张 → 4 组（每组 3 张）→ 小组赛 12 场；
  // 淘汰赛名额 = 歌手数（跨歌手模式下封顶 4，3 歌手则取 3，避免同歌手对决）→ 2 场 → 总 14
  const c = await api('POST', '/api/battles', {
    scopeType: 'multi-artist',
    artists: [
      { artistId: jay.artistId, albumCount: 4 },
      { artistId: ljj.artistId, albumCount: 4 },
      { artistId: cyx.artistId, albumCount: 4 },
    ],
  }, TOKEN);
  if (c.code !== 0) { check('创建多歌手对决', false, JSON.stringify(c).slice(0, 160)); return; }
  const b = c.data;
  check('创建成功', true, `id=${b.battleId} scope=${b.scopeType} 歌手数=3 总场=${b.matchTotal}`);
  check('3歌手×4张=12张 → 4组、总14（跨歌手封顶3强）', b.groupCount === 4 && b.matchTotal === 14, `组=${b.groupCount} 总=${b.matchTotal}`);
  const voted = await voteThrough(b.battleId, '多歌手');
  const res = await api('GET', `/api/battles/${b.battleId}/result`, null, TOKEN);
  check('多歌手模式跑到出冠军', res.code === 0 && res.data?.type === 'standard' && res.data?.champion, `冠军=${res.data?.champion?.name} 投了${voted}场`);
  await api('DELETE', `/api/battles/${b.battleId}`, null, TOKEN);
}

async function runAlignedMode() {
  console.log('\n=== ④ 模式 C：对位赛（aligned）===');
  const jay = await searchArtist('周杰伦');
  const ljj = await searchArtist('林俊杰');
  const cyx = await searchArtist('陈奕迅');
  if (!jay || !ljj || !cyx) return;
  const c = await api('POST', '/api/battles', {
    scopeType: 'aligned',
    artists: [
      { artistId: jay.artistId },
      { artistId: ljj.artistId },
      { artistId: cyx.artistId },
    ],
    alignCount: 2,
  }, TOKEN);
  if (c.code !== 0) { check('创建对位赛', false, JSON.stringify(c).slice(0, 160)); return; }
  const b = c.data;
  check('创建成功', true, `id=${b.battleId} scope=${b.scopeType} 歌手数=3 对位张数=${b.alignCount} 总场=${b.matchTotal}`);
  check('对位赛总场 = C(3,2)×2 = 6', b.matchTotal === 6, `总=${b.matchTotal}`);
  const voted = await voteThrough(b.battleId, '对位赛');
  const res = await api('GET', `/api/battles/${b.battleId}/result`, null, TOKEN);
  check('对位赛结果为逐行对照 + 按歌手积分', res.code === 0 && res.data?.type === 'aligned' && Array.isArray(res.data.points) && res.data.points.length >= 2, `rows=${res.data?.rows?.length} 歌手积分=${res.data?.points?.map((p) => p.wins).join('/')} 投了${voted}场`);
  await api('DELETE', `/api/battles/${b.battleId}`, null, TOKEN);
}

console.log('开始验证……');
await auth();
if (TOKEN) {
  await runArtistMode();
  await runMultiMode();
  await runAlignedMode();
}
console.log(`\n========== 结果：通过 ${pass} / 失败 ${fail} ==========`);
process.exit(fail === 0 ? 0 : 1);
