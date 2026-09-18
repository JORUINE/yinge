#!/usr/bin/env node
/**
 * 淘汰赛签表体检 / 修复（幂等，可反复跑）
 * ------------------------------------------------------------
 * 背景（2026-09-18 用户报的卡死 bug）：
 *   旧版「撤销上一步」按 matchOrder 删除"这一票之后的所有场次"。
 *   但 matchOrder 在**同一轮内也是递增的** —— 于是撤销一场半决赛时，
 *   会把同轮的**另一场半决赛**一起删掉，留下"半决赛只剩 1 场"的残缺轮次。
 *   推进逻辑看到"最后一轮所有场次都判完了"，就用这 1 个胜者生成了决赛（且是轮空场），
 *   而轮空场没有可投票的对阵 → 再也没有触发生成/推进的机会 →
 *   对局永久停在「本轮已投完，正在生成下一轮对阵…」。
 *
 * 本脚本做什么：
 *   逐轮核对淘汰赛签表的场次数是否与"上一轮胜者数"对得上；
 *   找到**第一处数量不对**的轮次 → 用确定性配对规则重建它，
 *   并把该轮之后的所有轮次删掉（它们本来就是基于残缺数据推出来的）。
 *   已存在的、配对上号的老场次会被复用（票数与胜方不丢），只补缺失场次。
 *
 * 用法：
 *   node scripts/repair-brackets.mjs              # 体检，只报告不改（默认）
 *   node scripts/repair-brackets.mjs --apply      # 真正修复
 *   node scripts/repair-brackets.mjs --apply <battleId>   # 只修某一局
 */
import mongoose from 'mongoose';
import { Battle, BattleMatch, BattleGroup, Album } from '../src/models/index.js';
import bracket from '../src/modules/battles/bracket.js';

const KO_NAMES = ['r32', 'r16', 'qf', 'semi', 'final'];
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const onlyId = args.find((a) => !a.startsWith('--'));

/** 一轮应有多少场：偶数参赛 = n/2；奇数参赛 = 轮空 1 场 + (n-1)/2 场 */
function expectedMatchCount(n) {
  return n % 2 === 0 ? n / 2 : (n - 1) / 2 + 1;
}

function samePair(match, leftId, rightId) {
  const a = String(match.leftAlbumId || '');
  const b = String(match.rightAlbumId || '');
  const l = String(leftId || '');
  const r = rightId ? String(rightId) : '';
  return (a === l && b === r) || (a === r && b === l);
}

/** 复刻 startKnockoutV2 的第一轮配对（跨歌手优先），保证与线上生成规则一致 */
async function firstRoundSpecs(battle, seeds) {
  const docs = await Album.find({ _id: { $in: seeds } }).select('_id artistExternalId').lean();
  const artistOf = new Map(docs.map((d) => [String(d._id), String(d.artistExternalId ?? d._id)]));
  const roundName = bracket.roundNameFor(seeds.length);
  if (artistOf.size > 1) {
    const pairs = bracket.buildFirstRoundCrossArtist(
      seeds.map((id) => ({ _id: id })),
      (id) => artistOf.get(String(id)),
    );
    return pairs.map((p) => ({ roundName, leftId: p.left._id, rightId: p.right ? p.right._id : null, isBye: !p.right }));
  }
  return bracket
    .buildKnockoutMatches(seeds.map((id) => ({ _id: id })), roundName, { roundIndex: 1, startOrder: 1 })
    .map((m) => ({ roundName, leftId: m.leftAlbumId, rightId: m.rightAlbumId, isBye: m.isBye }));
}

/** 体检一局；返回 null = 健康 / 未到淘汰赛；否则返回问题描述 */
async function audit(battle) {
  const groups = await BattleGroup.find({ battleId: battle._id }).sort({ groupNo: 1, roundName: 1 }).lean();
  const groupRounds = groups.filter((g) => g.roundName === 'group');
  if (!groupRounds.length || !groupRounds.every((g) => (g.pickedAlbumIds || []).length)) return null;

  const advanced = groupRounds.flatMap((g) => (g.pickedAlbumIds || []).map(String));
  const revival = groups.find((g) => g.roundName === 'revival');
  const seeds =
    battle.revivalNeed > 0 && revival && (revival.pickedAlbumIds || []).length
      ? [...advanced, ...revival.pickedAlbumIds.map(String)]
      : advanced;

  const matches = await BattleMatch.find({ battleId: battle._id, roundName: { $in: KO_NAMES } }).sort({
    matchOrder: 1,
  });
  const byRound = KO_NAMES.map((name) => [name, matches.filter((m) => m.roundName === name)]).filter(
    ([, list]) => list.length,
  );
  if (!byRound.length) return null;

  let participants = seeds.length;
  let prevWinners = null; // 上一轮的胜者（按 matchOrder 次序，与线上推进口径一致）
  for (let i = 0; i < byRound.length; i += 1) {
    const [name, list] = byRound[i];
    const want = expectedMatchCount(participants);
    if (list.length !== want) {
      return { index: i, name, want, got: list.length, byRound, prevWinners, seeds, matches };
    }
    const decided = list.every((m) => m.isBye || m.winnerAlbumId);
    if (!decided) {
      // 本轮还没打完：后面不该有轮次，若有则同样属于残缺数据
      if (i < byRound.length - 1) {
        return { index: i, name, want, got: list.length, reason: '本轮未打完却已存在后续轮次', byRound, prevWinners, seeds, matches };
      }
      return null; // 正常进行中
    }
    prevWinners = list.map((m) => m.winnerAlbumId || (m.isBye ? m.leftAlbumId : null)).filter(Boolean);
    participants = prevWinners.length;
  }
  return null;
}

async function repair(battle, issue) {
  const { index, name, byRound, prevWinners, seeds, matches } = issue;
  const specs =
    index === 0
      ? await firstRoundSpecs(battle, seeds)
      : bracket
          .buildKnockoutMatches(prevWinners.map((id) => ({ _id: id })), name, { roundIndex: 1, startOrder: 1 })
          .map((m) => ({ roundName: name, leftId: m.leftAlbumId, rightId: m.rightAlbumId, isBye: m.isBye }));

  const existing = byRound[index][1];
  const usedIds = new Set();
  const kept = [];
  const toCreate = [];
  for (const spec of specs) {
    const hit = existing.find((m) => !usedIds.has(String(m._id)) && samePair(m, spec.leftId, spec.rightId));
    if (hit) {
      usedIds.add(String(hit._id));
      kept.push(hit);
    } else {
      toCreate.push(spec);
    }
  }
  const dropped = existing.filter((m) => !usedIds.has(String(m._id)));
  // 该轮之后的所有轮次：基于残缺数据推出，全部作废
  const afterIds = matches.filter((m) => KO_NAMES.indexOf(m.roundName) > KO_NAMES.indexOf(name)).map((m) => m._id);

  const report = {
    battleId: String(battle._id),
    round: name,
    expected: specs.length,
    was: existing.length,
    keep: kept.length,
    create: toCreate.length,
    drop: dropped.length,
    dropLaterRounds: afterIds.length,
  };
  if (!APPLY) return report;

  if (afterIds.length) await BattleMatch.deleteMany({ _id: { $in: afterIds } });
  if (dropped.length) await BattleMatch.deleteMany({ _id: { $in: dropped.map((m) => m._id) } });

  let order = await BattleMatch.findOne({ battleId: battle._id }).sort({ matchOrder: -1 }).select('matchOrder').lean();
  let next = (order?.matchOrder || 0) + 1;
  if (toCreate.length) {
    await BattleMatch.insertMany(
      toCreate.map((s) => ({
        battleId: battle._id,
        roundName: s.roundName,
        roundIndex: 1,
        matchOrder: next++,
        leftAlbumId: s.leftId,
        rightAlbumId: s.rightId,
        isBye: s.isBye,
        isRevival: false,
      })),
    );
  }

  // 全量重排 matchOrder：轮次顺序 → 轮内次序，保证它在任何地方都单调递增
  const fresh = await BattleMatch.find({ battleId: battle._id }).lean();
  const ordered = fresh
    .slice()
    .sort(
      (a, b) =>
        KO_NAMES.indexOf(a.roundName) - KO_NAMES.indexOf(b.roundName) || a.matchOrder - b.matchOrder,
    );
  let seq = 1;
  for (const m of ordered) {
    // eslint-disable-next-line no-await-in-loop
    await BattleMatch.updateOne({ _id: m._id }, { $set: { matchOrder: seq } });
    seq += 1;
  }

  const koRoundsLeft = new Set(ordered.filter((m) => KO_NAMES.includes(m.roundName)).map((m) => m.roundName));
  await Battle.updateOne(
    { _id: battle._id },
    {
      $set: {
        currentRound: (battle.groupCount || 0) + (battle.revivalNeed > 0 ? 1 : 0) + Math.max(1, koRoundsLeft.size),
        status: 'playing',
        championAlbumId: null,
      },
    },
  );
  return report;
}

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge');

const query = { tournamentVersion: 2 };
if (onlyId) query._id = onlyId;
if (!APPLY && !onlyId) query.status = 'playing';
const battles = await Battle.find(query).sort({ createdAt: -1 }).limit(200).lean();

let checked = 0;
let bugs = 0;
for (const battle of battles) {
  // eslint-disable-next-line no-await-in-loop
  const issue = await audit(battle);
  checked += 1;
  if (!issue) continue;
  bugs += 1;
  // eslint-disable-next-line no-await-in-loop
  const rep = await repair(battle, issue);
  console.log(
    `${APPLY ? '已修复' : '发现异常'}  ${String(battle._id)}  ${battle.scopeType}/${battle.albumIds?.length}张  ` +
      `轮次=${rep.round}  应为${rep.expected}场/实际${rep.was}场  ` +
      `保留${rep.keep} 新建${rep.create} 删除本轮多余${rep.drop} 作废后续轮次${rep.dropLaterRounds}`,
  );
}
console.log(`\n体检 ${checked} 局，异常 ${bugs} 局。${APPLY ? '已全部修复。' : '（默认只报告，加 --apply 才执行修复）'}`);
await mongoose.disconnect();
