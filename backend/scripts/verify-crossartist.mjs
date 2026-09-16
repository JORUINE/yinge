/**
 * 「跨歌手对决」真实链路验证 —— 对应《系统设计文档》4.4 规则(2)
 *   1. 多歌手（2 位 × 3 张，陶喆 + 周杰伦）：每一场都必须跨歌手；2 位歌手时直接决赛
 *   2. 多歌手（3 位 × 3 张）：小组赛 + 淘汰赛全程跨歌手
 *   3. 张数不等（5 + 3）：各歌手统一取最小值 3 张，避免出现"没有对手"的专辑
 *   4. 多歌手不支持复活赛（会破坏跨歌手规则）
 *   5. 单歌手模式：允许"自己打自己"（回归保护，不能被一并改掉）
 *   6. 指定对决：用户手排，允许同歌手（回归保护）
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
  const acc = 'cross_' + Math.random().toString(36).slice(2, 9);
  const r = await api('POST', '/api/auth/register', { account: acc, password: 'test123456', nickname: acc });
  if (r.code !== 0) throw new Error('注册失败 ' + JSON.stringify(r).slice(0, 120));
  TOKEN = r.data.token;
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

async function voteThrough(battleId, label) {
  let voted = 0; let i = 0;
  for (let guard = 0; guard < 70; guard += 1) {
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

/** 取详情并统计"同歌手对局"的场次 */
async function scanSameArtist(battleId, label, expectCross) {
  const d = await api('GET', `/api/battles/${battleId}`, null, TOKEN);
  if (d.code !== 0) { check(`${label} 取详情`, false, `code=${d.code} ${d.message}`); return null; }
  const matches = d.data.matches || [];
  const sameList = matches.filter(
    (m) => m.leftAlbum?.artistId != null
      && m.rightAlbum?.artistId != null
      && String(m.leftAlbum.artistId) === String(m.rightAlbum.artistId),
  );
  if (expectCross) {
    check(`${label}：${matches.length} 场全部跨歌手`, sameList.length === 0, `同歌手对局 ${sameList.length} 场`);
    if (sameList.length) {
      sameList.slice(0, 3).forEach((m) => console.log(`      ✗ ${m.leftAlbum.name} vs ${m.rightAlbum.name}`));
    }
  } else {
    check(`${label}：允许同歌手（出现 ${sameList.length} 场）`, sameList.length > 0, `共 ${matches.length} 场`);
  }
  return d.data;
}

console.log('开始验证……');
await auth();

const jay = await artistId('周杰伦');
const tao = await artistId('陶喆');
let third = null;
for (const name of ['林俊杰', '王力宏', '陈奕迅']) {
  try { third = await artistId(name); break; } catch { /* 换下一个 */ }
}
console.log(`  周杰伦 #${jay.artistId} / 陶喆 #${tao.artistId} / 第三位 #${third?.artistId} ${third?.name || ''}`);

const jayAlbums = await albumsOf(jay.artistId);
const taoAlbums = await albumsOf(tao.artistId);
console.log(`  周杰伦合格 ${jayAlbums.length} 张；陶喆 ${taoAlbums.length} 张`);

// ---------- 1. 多歌手 2 位 × 3 张 ----------
console.log('\n=== ① 多歌手混战 · 2 位 × 3 张（陶喆 + 周杰伦）===');
{
  const c = await api('POST', '/api/battles', {
    scopeType: 'multi-artist',
    artists: [{ artistId: tao.artistId, albumCount: 3 }, { artistId: jay.artistId, albumCount: 3 }],
  }, TOKEN);
  check('创建多歌手对决', c.code === 0, `code=${c.code} ${c.message || ''}`);
  if (c.code === 0) {
    const b = c.data;
    // 2 位歌手 → 组容量 2 → 3 组各 1 场 = 3 场；2 位歌手只能打一场决赛 → 共 4 场
    check('总场次 = 3 场小组 + 1 场决赛 = 4', b.matchTotal === 4, `总=${b.matchTotal} 组=${b.groupCount}`);
    await scanSameArtist(b.battleId, '小组赛', true);

    const rev = await api('POST', `/api/battles/${b.battleId}/revival`, null, TOKEN);
    check('多歌手不支持复活赛（被拒）', rev.code === 1001, `code=${rev.code} ${rev.message || ''}`);

    const voted = await voteThrough(b.battleId, '2歌手');
    const detail = await scanSameArtist(b.battleId, '含决赛的全部场次', true);
    const rounds = [...new Set((detail.matches || []).map((m) => m.roundName))].sort();
    check('2 位歌手 → 直接决赛（无半决赛）', !rounds.includes('semi') && rounds.includes('final'), `轮次=${rounds.join('/')}`);
    const res = await api('GET', `/api/battles/${b.battleId}/result`, null, TOKEN);
    check('结果为标准赛制且产生冠军', res.data?.type === 'standard' && !!res.data?.champion,
      `冠军=${res.data?.champion?.name || '-'} 投了${voted}场`);
    await api('DELETE', `/api/battles/${b.battleId}`, null, TOKEN);
  }
}

// ---------- 2. 多歌手 3 位 × 3 张 ----------
console.log('\n=== ② 多歌手混战 · 3 位 × 3 张 ===');
if (!third) {
  console.log('  [--] 跳过：未能找到第三位歌手');
} else {
  const c = await api('POST', '/api/battles', {
    scopeType: 'multi-artist',
    artists: [
      { artistId: jay.artistId, albumCount: 3 },
      { artistId: tao.artistId, albumCount: 3 },
      { artistId: third.artistId, albumCount: 3 },
    ],
  }, TOKEN);
  check('创建 3 位歌手对决', c.code === 0, `code=${c.code} ${c.message || ''}`);
  if (c.code === 0) {
    const b = c.data;
    // 组容量 3 → 3 组 × C(3,2)=3 → 9 场；四强席位 = min(4,3) = 3 → 淘汰赛 2 场 → 共 11 场
    check('总场次 = 9 场小组 + 2 场淘汰 = 11', b.matchTotal === 11, `总=${b.matchTotal} 组=${b.groupCount}`);
    await scanSameArtist(b.battleId, '小组赛', true);
    const voted = await voteThrough(b.battleId, '3歌手');
    const detail = await scanSameArtist(b.battleId, '含淘汰赛的全部场次', true);
    const rounds = [...new Set((detail.matches || []).map((m) => m.roundName))].sort();
    check('淘汰赛轮次齐全', rounds.includes('semi') && rounds.includes('final'), `轮次=${rounds.join('/')}`);
    check('投满全部场次', voted === b.matchTotal, `投了 ${voted} / ${b.matchTotal}`);
    await api('DELETE', `/api/battles/${b.battleId}`, null, TOKEN);
  }
}

// ---------- 3. 张数不等 → 统一取最小值 ----------
console.log('\n=== ③ 张数不等（5 + 3）→ 统一取 3 张 ===');
{
  const c = await api('POST', '/api/battles', {
    scopeType: 'multi-artist',
    artists: [{ artistId: jay.artistId, albumCount: 5 }, { artistId: tao.artistId, albumCount: 3 }],
  }, TOKEN);
  check('创建成功', c.code === 0, `code=${c.code} ${c.message || ''}`);
  if (c.code === 0) {
    const counts = (c.data.artists || []).map((a) => a.albumCount);
    check('每位歌手实际参赛均为 3 张', counts.length === 2 && counts.every((n) => n === 3), `实际=${counts.join('/')}`);
    await scanSameArtist(c.data.battleId, '小组赛', true);
    await api('DELETE', `/api/battles/${c.data.battleId}`, null, TOKEN);
  }
}

// ---------- 4. 单歌手：允许自己打自己（回归保护）----------
console.log('\n=== ④ 单歌手模式（应允许同歌手对局）===');
{
  const c = await api('POST', '/api/battles', {
    scopeType: 'artist',
    artistId: jay.artistId,
    albumCount: 4,
  }, TOKEN);
  check('创建单歌手对决', c.code === 0, `code=${c.code} ${c.message || ''}`);
  if (c.code === 0) {
    await scanSameArtist(c.data.battleId, '单歌手', false);
    await api('DELETE', `/api/battles/${c.data.battleId}`, null, TOKEN);
  }
}

// ---------- 5. 指定对决：允许同歌手（回归保护）----------
console.log('\n=== ⑤ 指定对决模式（应允许同歌手对局）===');
{
  const c = await api('POST', '/api/battles', {
    scopeType: 'duel',
    pairs: [[jayAlbums[0].albumId, jayAlbums[1].albumId]],
  }, TOKEN);
  check('创建同歌手指定对决', c.code === 0, `code=${c.code} ${c.message || ''}`);
  if (c.code === 0) {
    await scanSameArtist(c.data.battleId, '指定对决', false);
    await api('DELETE', `/api/battles/${c.data.battleId}`, null, TOKEN);
  }
}

console.log(`\n========== 结果：通过 ${pass} / 失败 ${fail} ==========`);
process.exit(fail === 0 ? 0 : 1);
