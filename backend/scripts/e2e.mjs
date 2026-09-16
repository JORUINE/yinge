/**
 * 端到端集成测试（需要真实 MongoDB 与可用的 iTunes 网络）
 * ------------------------------------------------------------
 * 覆盖链路：注册 → 登录 → 人格测评（含降级） → 抓取歌手专辑（准入过滤）
 *          → 创建对决 → 逐场投票（自动推进小组赛→半决赛→决赛） → 冠军与夺冠路径
 * 用法：node scripts/e2e.mjs
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';

process.env.PORT ||= '0';
const { default: createApp } = await import('../src/app.js');

const app = createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

const results = [];
let token = '';
function check(name, pass, detail = '') {
  results.push({ name, pass });
  process.stdout.write(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}
function skip(name, detail) {
  results.push({ name, pass: true, skipped: true });
  process.stdout.write(`[SKIP] ${name} — ${detail}\n`);
}

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, code: json?.code, data: json?.data, message: json?.message };
}

await connectDb();

// ---------- 1. 注册与鉴权 ----------
const account = `t${Date.now()}`.slice(0, 18);
let r = await api('POST', '/api/auth/register', { account, password: 'test123456', nickname: `测试${account.slice(-4)}` });
check('注册成功并返回令牌', r.code === 0 && Boolean(r.data?.token), `code=${r.code}`);
token = r.data?.token || '';

r = await api('GET', '/api/auth/me');
check('GET /api/auth/me 返回当前用户', r.code === 0 && r.data?.account === account.toLowerCase(), `account=${r.data?.account}`);

// ---------- 2. 人格测评 ----------
r = await api('GET', '/api/personality/questions');
const questions = r.data?.list || [];
check('获取到 12 道题目', r.code === 0 && questions.length === 12, `count=${questions.length}`);

const answers = questions.map((q) => ({ questionId: q.questionId, optionKey: q.options[0].key }));
r = await api('POST', '/api/personality/submit', { answers });
const resultId = r.data?.resultId;
check('提交作答并得出人格类型', r.code === 0 && Boolean(r.data?.typeCode), `typeCode=${r.data?.typeCode}`);
check(
  '未配置密钥时解读来源为 template（降级可用）',
  r.data?.aiCommentSource === 'template',
  `source=${r.data?.aiCommentSource}`,
);
check('结果保留作答明细可复查', Array.isArray(r.data?.answers) && r.data.answers.length === 12, `answers=${r.data?.answers?.length}`);

if (resultId) {
  r = await api('GET', `/api/personality/results/${resultId}`);
  check('结果详情可读取且类型一致', r.code === 0 && Boolean(r.data?.typeCode));
}

// 缺题应被拒绝
r = await api('POST', '/api/personality/submit', { answers: answers.slice(0, 5) });
check('缺题提交被拒绝（1001）', r.code === 1001, `code=${r.code}`);

// ---------- 3. 音乐数据（真实 iTunes） ----------
let artistId = null;
let poolStats = null;
for (const term of ['周杰伦', 'Jay Chou', '陶喆', 'David Tao', '陈奕迅']) {
  const s = await api('GET', `/api/music/artists/search?term=${encodeURIComponent(term)}&limit=3`);
  if (s.code === 0 && s.data?.artists?.length) {
    artistId = s.data.artists[0].artistId;
    check(`歌手搜索可用（${term}）`, true, `${s.data.artists[0].name} #${artistId} 地区=${s.data.country}`);
    break;
  }
}

let eligibleCount = 0;
if (artistId) {
  r = await api('GET', `/api/music/artists/${artistId}/albums`);
  poolStats = r.data?.stats;
  eligibleCount = poolStats?.valid || 0;
  check('专辑池返回准入过滤统计', r.code === 0 && poolStats && typeof poolStats.total === 'number',
    `共 ${poolStats?.total} 张 / 剔除 ${poolStats?.excluded} / 参赛 ${poolStats?.valid}`);
  check('准入过滤：总数 = 参赛 + 剔除', poolStats.total === poolStats.valid + poolStats.excluded,
    `${poolStats.total} = ${poolStats.valid} + ${poolStats.excluded}`);
} else {
  skip('音乐数据链路', '网络不可达或搜索无结果，跳过 iTunes 相关断言');
}

// ---------- 4. 创建对决并逐场投票 ----------
if (eligibleCount >= 4) {
  r = await api('POST', '/api/battles', { scopeType: 'artist', artistId });
  const battleId = r.data?.battleId;
  const matchTotal = r.data?.matchTotal;
  check('创建对决成功', r.code === 0 && Boolean(battleId), `matchTotal=${matchTotal} groupCount=${r.data?.groupCount}`);

  const detail0 = await api('GET', `/api/battles/${battleId}`);
  const groupMs = (detail0.data?.matches || []).filter((m) => m.roundName === 'group' && !m.isBye);
  check(
    'matchTotal = 实际小组赛场次 + 3（半决 2 + 决 1）',
    matchTotal === groupMs.length + 3,
    `${groupMs.length} + 3 = ${groupMs.length + 3}，实际 ${matchTotal}（${r.data?.groupCount} 组）`,
  );

  let voted = 0;
  let rateLimitChecked = false;
  let dupChecked = false;
  let next = await api('GET', `/api/battles/${battleId}/next-match`);
  while (next.code === 0 && !next.data?.finished && voted < 40) {
    const currentMatchId = next.data.matchId;
    // 交替选择左右，避免命中"连续多场投向同一侧"的中度异常启发式
    const pickAlbum = voted % 2 === 0 ? next.data.left : next.data.right;
    const v = await api('POST', `/api/battles/${battleId}/matches/${currentMatchId}/vote`, {
      albumId: pickAlbum.albumId,
    });
    if (v.code !== 0) {
      check('投票失败', false, `code=${v.code} message=${v.message}`);
      break;
    }
    voted += 1;

    // 同一场立刻重复投票 → 3001（本场已决出结果）
    if (!dupChecked) {
      const dup = await api('POST', `/api/battles/${battleId}/matches/${currentMatchId}/vote`, {
        albumId: pickAlbum.albumId,
      });
      check('重复投同一场被拒绝（3001）', dup.code === 3001, `code=${dup.code}`);
      dupChecked = true;
    }

    // 紧接着再投下一场 → 应按防刷票规则被轻度限流（1003，不计违规）
    if (!rateLimitChecked) {
      const nx = await api('GET', `/api/battles/${battleId}/next-match`);
      if (nx.data?.matchId) {
        const quick = await api('POST', `/api/battles/${battleId}/matches/${nx.data.matchId}/vote`, {
          albumId: nx.data.left.albumId,
        });
        check('相邻两次投票间隔过短被限流（1003）', quick.code === 1003, `code=${quick.code}`);
        rateLimitChecked = true;
      }
    }

    await new Promise((r) => setTimeout(r, 3300)); // 遵守投票间隔阈值
    next = await api('GET', `/api/battles/${battleId}/next-match`);
  }
  check('逐场投票可推进赛程直至本轮结束', voted >= 12, `已投 ${voted} 场`);

  const res = await api('GET', `/api/battles/${battleId}/result`);
  check('对决结束后状态为 finished', res.data?.battle?.status === 'finished', `status=${res.data?.battle?.status}`);
  check('冠军已产生且夺冠路径非空', Boolean(res.data?.champion) && (res.data?.path?.length || 0) >= 3,
    `冠军=${res.data?.champion?.name} 路径 ${res.data?.path?.length} 场`);

  // 榜单（有效票聚合）
  const rank = await api('GET', '/api/rank/albums?limit=5');
  check('榜单按有效票返回', rank.code === 0 && Array.isArray(rank.data?.list), `条数=${rank.data?.list?.length}`);
} else {
  skip('对决全流程', `合格专辑不足 4 张（${eligibleCount}），跳过`);
}

// ---------- 5. 管理员接口 ----------
const beforeToken = token;
token = '';
r = await api('POST', '/api/admin/login', { account: 'admin', password: 'admin123456' });
check('管理员可登录', r.code === 0 && Boolean(r.data?.token), `code=${r.code}`);
const adminToken = r.data?.token || '';

token = beforeToken;
r = await api('GET', '/api/admin/users');
check('普通用户访问后台被拒绝（2002）', r.code === 2002, `code=${r.code}`);

token = adminToken;
r = await api('GET', '/api/admin/dashboard');
check('管理员可读取仪表盘', r.code === 0 && typeof r.data?.users?.total === 'number', `用户数=${r.data?.users?.total}`);

server.close();
await disconnectDb();

const failed = results.filter((x) => !x.pass);
const skipped = results.filter((x) => x.skipped);
process.stdout.write(
  `\n合计 ${results.length} 项：通过 ${results.length - failed.length - skipped.length}，跳过 ${skipped.length}，失败 ${failed.length}\n`,
);
process.exit(failed.length ? 1 : 0);
