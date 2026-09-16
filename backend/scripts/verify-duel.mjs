/**
 * 「指定对决（duel）」+ 对位配对方式（alignMode）真实链路验证
 *   1. duel 单组：陶喆《黑色柳丁》 vs 周杰伦《Jay》(跨序号) —— 直接单挑
 *   2. duel 多组：3 组对位 → 逐行对照表 3 行
 *   3. aligned + chrono：年代就近配对仍为 N 场
 */
const BASE = 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, info = '') => {
  if (ok) { pass++; console.log(`  [OK] ${name}${info ? '  ' + info : ''}`); }
  else { fail++; console.log(`  [XX] ${name}  → ${info}`); }
};

const headers = (t) => ({ 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) });
async function api(method, path, body, token) {
  const res = await fetch(BASE + path, { method, headers: headers(token), body: body ? JSON.stringify(body) : undefined });
  return res.json().catch(() => ({}));
}
let TOKEN = null;
async function auth() {
  const acc = 'duel_' + Math.random().toString(36).slice(2, 9);
  const r = await api('POST', '/api/auth/register', { account: acc, password: 'test123456', nickname: acc });
  if (r.code !== 0) throw new Error('注册失败 ' + JSON.stringify(r).slice(0, 120));
  TOKEN = r.data.token;
  console.log(`  账号 ${acc}`);
}
async function artistId(term) {
  const r = await api('GET', `/api/music/artists/search?term=${encodeURIComponent(term)}`);
  if (r.code !== 0 || !r.data?.artists?.length) throw new Error(`搜索「${term}」无结果`);
  return r.data.artists[0];
}
async function albumsOf(id) {
  const r = await api('GET', `/api/music/artists/${id}/albums`);
  if (r.code !== 0) throw new Error('取专辑失败 ' + JSON.stringify(r).slice(0, 120));
  return r.data.eligible;
}
const pickBy = (list, kw) => list.find((a) => a.name.includes(kw)) || null;

async function voteThrough(battleId, label) {
  let voted = 0; let i = 0;
  for (let guard = 0; guard < 60; guard += 1) {
    const next = await api('GET', `/api/battles/${battleId}/next-match`, null, TOKEN);
    if (next.code !== 0) { check(`${label} 取场次`, false, `code=${next.code} ${next.message}`); return voted; }
    if (next.data?.finished) break;
    const m = next.data;
    const pick = i % 2 === 0 ? m.left : m.right;
    const v = await api('POST', `/api/battles/${battleId}/matches/${m.matchId}/vote`, { albumId: pick.albumId }, TOKEN);
    if (v.code === 1003) { await sleep(3600); continue; }
    if (v.code !== 0) { check(`${label} 投票`, false, `code=${v.code} ${v.message}`); return voted; }
    voted++; i++;
    await sleep(3600);
  }
  return voted;
}

console.log('开始验证……');
await auth();

const jay = await artistId('周杰伦');
const tao = await artistId('陶喆');
console.log(`  周杰伦 #${jay.artistId}   陶喆 #${tao.artistId}`);
const jayAlbums = await albumsOf(jay.artistId);
const taoAlbums = await albumsOf(tao.artistId);
console.log(`  周杰伦合格专辑 ${jayAlbums.length} 张；陶喆 ${taoAlbums.length} 张`);

// ---------- 1. duel 单组（跨序号）----------
console.log('\n=== ① 指定对决 · 单组（黑色柳丁 vs Jay）===');
const black = pickBy(taoAlbums, '黑色柳丁') || taoAlbums[0];
const jayDebut = pickBy(jayAlbums, 'Jay') || pickBy(jayAlbums, '杰') || jayAlbums[jayAlbums.length - 1];
console.log(`  选中：${black.name}(${black.albumId})  vs  ${jayDebut.name}(${jayDebut.albumId})`);
{
  const c = await api('POST', '/api/battles', { scopeType: 'duel', pairs: [[black.albumId, jayDebut.albumId]] }, TOKEN);
  check('创建单组指定对决', c.code === 0, `code=${c.code} ${c.message || ''}`);
  if (c.code === 0) {
    const b = c.data;
    check('scopeType=duel 且总场次=1', b.scopeType === 'duel' && b.matchTotal === 1, `scope=${b.scopeType} 总=${b.matchTotal} 组=${b.groupCount}`);
    const voted = await voteThrough(b.battleId, '单组');
    const res = await api('GET', `/api/battles/${b.battleId}/result`, null, TOKEN);
    const rows = res.data?.rows || [];
    const right = rows[0] && ((String(rows[0].left?.albumId) === String(black.albumId)) || (String(rows[0].right?.albumId) === String(black.albumId)));
    check('结果=逐行对照表且命中指定两张', res.data?.type === 'aligned' && rows.length === 1 && right,
      `rows=${rows.length} 投了${voted}场`);
    const r0 = rows[0] || {};
    const winnerOk = r0.winnerAlbumId != null
      && (String(r0.winnerAlbumId) === String(r0.left?.albumId) || String(r0.winnerAlbumId) === String(r0.right?.albumId));
    check('胜者用外部专辑标识（与 left/right 同口径）', winnerOk, `winner=${r0.winnerAlbumId}`);
    await api('DELETE', `/api/battles/${b.battleId}`, null, TOKEN);
  }
}

// ---------- 2. duel 多组 ----------
console.log('\n=== ② 指定对决 · 多组（3 组对照表）===');
{
  const pairs = [
    [taoAlbums[0].albumId, jayAlbums[0].albumId],
    [taoAlbums[1].albumId, jayAlbums[1].albumId],
    [taoAlbums[2].albumId, jayAlbums[2].albumId],
  ];
  const c = await api('POST', '/api/battles', { scopeType: 'duel', pairs }, TOKEN);
  check('创建 3 组指定对决', c.code === 0, `code=${c.code} ${c.message || ''}`);
  if (c.code === 0) {
    const b = c.data;
    check('总场次=3（每组一场）', b.matchTotal === 3 && b.groupCount === 3, `总=${b.matchTotal} 组=${b.groupCount}`);
    const voted = await voteThrough(b.battleId, '多组');
    const res = await api('GET', `/api/battles/${b.battleId}/result`, null, TOKEN);
    check('对照表 3 行 + 全部决出', res.data?.rows?.length === 3 && res.data.rows.every((r) => r.winnerAlbumId), `投了${voted}场`);
    await api('DELETE', `/api/battles/${b.battleId}`, null, TOKEN);
  }
}

// ---------- 3. 非法入参 ----------
console.log('\n=== ③ 指定对决 · 非法入参 ===');
{
  const e1 = await api('POST', '/api/battles', { scopeType: 'duel', pairs: [] }, TOKEN);
  check('空 pairs 被拒（1001）', e1.code === 1001, `code=${e1.code}`);
  const e2 = await api('POST', '/api/battles', { scopeType: 'duel', pairs: [[black.albumId, 1]] }, TOKEN);
  check('含无效专辑被拒（1001）', e2.code === 1001, `code=${e2.code} ${e2.message || ''}`);
  const e3 = await api('POST', '/api/battles', { scopeType: 'duel', pairs: [[black.albumId, black.albumId]] }, TOKEN);
  check('同组同一张被拒（1001）', e3.code === 1001, `code=${e3.code} ${e3.message || ''}`);
}

// ---------- 4. aligned chrono ----------
console.log('\n=== ④ 对位赛 · 年代就近（chrono）===');
{
  const c = await api('POST', '/api/battles', {
    scopeType: 'aligned',
    artists: [{ artistId: jay.artistId }, { artistId: tao.artistId }],
    alignCount: 3,
    alignMode: 'chrono',
  }, TOKEN);
  check('创建 chrono 对位赛', c.code === 0, `code=${c.code} ${c.message || ''}`);
  if (c.code === 0) {
    const b = c.data;
    check('2 歌手 × 3 张 = 3 场', b.matchTotal === 3, `总=${b.matchTotal}`);
    const voted = await voteThrough(b.battleId, 'chrono');
    const res = await api('GET', `/api/battles/${b.battleId}/result`, null, TOKEN);
    check('chrono 结果=对照表 3 行', res.data?.type === 'aligned' && res.data.rows.length === 3, `投了${voted}场`);
    await api('DELETE', `/api/battles/${b.battleId}`, null, TOKEN);
  }
}

console.log(`\n========== 结果：通过 ${pass} / 失败 ${fail} ==========`);
process.exit(fail === 0 ? 0 : 1);
