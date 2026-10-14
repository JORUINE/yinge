#!/usr/bin/env node
/**
 * 音格 · 把本地 MongoDB 数据迁到 MongoDB Atlas（或任何另一个 Mongo）
 * ------------------------------------------------------------------
 * 为什么不用 mongodump / mongorestore：本机那份 MongoDB 是绿色版，
 * bin 目录里只有 mongod.exe，没有数据库工具。而且 Node 脚本能自己校验条数，
 * 比"跑完不知道成没成"更稳。
 *
 * ⚠️ 三条硬规矩：
 *   1. **默认只读演练（dry-run）**，一个字节都不写。要真写必须显式加 `--apply`。
 *   2. **保留 `_id` 原样搬运** —— 库里的 albumId / winnerAlbumId / userId 全是 ObjectId 外键，
 *      重新生成 _id 会让所有关联瞬间全烂（表现为"对战记录还在但专辑全丢了"）。
 *   3. **目标集合非空时默认拒绝**（除非 `--force`）—— 防止把线上已有数据冲掉。
 *
 * 用法：
 *   node scripts/migrate-to-atlas.mjs                          # dry-run：只报"会搬什么"
 *   node scripts/migrate-to-atlas.mjs --apply                  # 写入 $MONGODB_URI_TARGET
 *   node scripts/migrate-to-atlas.mjs "mongodb+srv://…" --apply  # 目标连接串直接给
 *   node scripts/migrate-to-atlas.mjs "mongodb+srv://…" --apply --only albums,artists
 *   node scripts/migrate-to-atlas.mjs "mongodb://…" --apply --force   # 目标非空也覆盖
 *
 * 源库默认取 backend/.env 里的 MONGODB_URI（也可用 --from 覆盖）。
 */
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');
const flagVal = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const onlyIdx = argv.indexOf('--only');
const ONLY = onlyIdx >= 0 && argv[onlyIdx + 1]
  ? argv[onlyIdx + 1].split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const positional = argv.filter((a) => !a.startsWith('--') && a !== APPLY && a !== FORCE
  && a !== onlyIdx && !(onlyIdx >= 0 && argv[onlyIdx + 1] === a));

const SOURCE = flagVal('--from') || process.env.MONGODB_URI;
const TARGET = positional[0] || flagVal('--to') || process.env.MONGODB_URI_TARGET;

const BATCH = 500;

function die(msg) {
  console.log('\n❌ ' + msg);
  process.exit(2);
}
const pad = (s, n) => String(s).padEnd(n);
const padStart = (s, n) => String(s).padStart(n);

if (!SOURCE) die('没有源库连接串。请设置 backend/.env 的 MONGODB_URI，或用 --from 指定。');
if (!APPLY && !TARGET) {
  console.log('· 未给目标连接串 ⇒ 进入**只读演练**模式（不会写任何东西）');
}
if (APPLY && !TARGET) die('加了 --apply 却没给目标连接串。用法：node scripts/migrate-to-atlas.mjs "mongodb+srv://…" --apply');

const src = new MongoClient(SOURCE, { serverSelectionTimeoutMS: 8000 });
await src.connect();
const sdb = src.db();
const collections = (await sdb.listCollections().toArray())
  .map((c) => c.name)
  .filter((n) => !n.startsWith('system.'))
  .filter((n) => (ONLY ? ONLY.includes(n) : true))
  .sort();

console.log('\n════ 音格 · 数据库迁移 ' + (APPLY ? '【真写模式 --apply】' : '【只读演练 dry-run】') + ' ════');
console.log('源库：' + SOURCE.replace(/\/\/[^@]*@/, '//<账号:密码>@'));
if (TARGET) console.log('目标：' + TARGET.replace(/\/\/[^@]*@/, '//<账号:密码>@'));
if (ONLY) console.log('只搬：' + ONLY.join(', '));
console.log('集合数：' + collections.length + '\n');

if (!collections.length) die('源库一个集合都没有 —— 是不是连错库了？');

// ── 先统计源库 ──
const plan = [];
for (const name of collections) {
  const n = await sdb.collection(name).countDocuments();
  plan.push({ name, count: n });
}
const totalDocs = plan.reduce((s, r) => s + r.count, 0);
const st = await sdb.stats();
console.log('源库合计 ' + totalDocs + ' 条文档 / ' + collections.length + ' 个集合 / '
  + (st.dataSize / 1048576).toFixed(2) + ' MB 数据\n');

// ── 演练模式：只报计划 ──
if (!APPLY) {
  console.log(pad('集合', 26) + padStart('将搬运', 10) + '   说明');
  console.log('─'.repeat(62));
  for (const r of plan) {
    const note = r.count === 0 ? '（空集合，可跳过）' : '';
    console.log(pad(r.name, 26) + padStart(r.count, 10) + '   ' + note);
  }
  console.log('─'.repeat(62));
  console.log('合计 ' + totalDocs + ' 条。');
  console.log('\n✅ 演练完成，未写入任何数据。确认无误后加 --apply 真搬：');
  console.log('   node scripts/migrate-to-atlas.mjs "<目标连接串>" --apply\n');
  await src.close();
  process.exit(0);
}

// ── 真写模式 ──
const dst = new MongoClient(TARGET, { serverSelectionTimeoutMS: 15000 });
await dst.connect();
const ddb = dst.db();
console.log('目标库已连接：' + ddb.databaseName + '\n');

let okCount = 0;
let failCount = 0;
for (const r of plan) {
  const scol = sdb.collection(r.name);
  const dcol = ddb.collection(r.name);
  const existing = await dcol.countDocuments();
  process.stdout.write(pad(r.name, 26) + padStart(r.count, 8) + ' 条 → ');

  if (r.count === 0) {
    console.log('跳过（源为空）');
    continue;
  }
  if (existing > 0 && !FORCE) {
    console.log('⚠️ 目标已有 ' + existing + ' 条，拒绝覆盖（加 --force 才覆盖）');
    failCount += 1;
    continue;
  }
  if (existing > 0 && FORCE) {
    await dcol.drop();
    process.stdout.write('(已清空目标) ');
  }

  let copied = 0;
  try {
    const cursor = scol.find({}, { batchSize: BATCH });
    let buf = [];
    while (await cursor.hasNext()) {
      buf.push(await cursor.next());
      if (buf.length >= BATCH) {
        await dcol.insertMany(buf, { ordered: false });
        copied += buf.length;
        buf = [];
      }
    }
    if (buf.length) {
      await dcol.insertMany(buf, { ordered: false });
      copied += buf.length;
    }
  } catch (e) {
    console.log('❌ 失败：' + e.message);
    failCount += 1;
    continue;
  }

  const after = await dcol.countDocuments();
  const same = after === r.count;
  console.log((same ? '✅ ' : '❌ ') + '写入 ' + copied + ' / 核对 ' + after
    + (same ? '（一致）' : '（不一致！源 ' + r.count + '）'));
  if (same) okCount += 1; else failCount += 1;
}

// ── 外键抽检：证明 _id 保住了、关联没烂 ──
// ⚠️ 抽检必须**查不到就报错**，不能"跳过" —— 跳过等于断言空转（假绿）。
//    第一版这里按猜的字段名 `pool` 取，实际字段叫 `albumIds` ⇒ 条件永不成立、抽检一声不响地过去了。
//    字段名一律以 src/models/Battle.js 为准：albumIds / championAlbumId / userId。
console.log('\n── 外键抽检（证明 _id 原样搬过来了、关联没烂）──');
const spotFail = [];
try {
  // 优先挑一局**已打完**的（有 championAlbumId），这样冠军外键也能真验到；
  // 找不到才退回任意带 albumIds 的局。挑不到就直接报错，不当成"通过"。
  const b = (await sdb.collection('battles').findOne({ championAlbumId: { $ne: null }, albumIds: { $ne: [] } }))
    || (await sdb.collection('battles').findOne({ albumIds: { $exists: true, $ne: [] } }));
  if (!b) {
    console.log('  ❌ 源库里找不到带 albumIds 的对局，抽检无法进行（这不是"通过"）');
    spotFail.push('no-sample-battle');
  } else {
    const hit = await ddb.collection('battles').findOne({ _id: b._id });
    console.log('  battles 样例 _id ' + b._id + ' → 目标' + (hit ? '能找到 ✅' : '找不到 ❌'));
    if (!hit) spotFail.push('battle-missing');

    const alb0 = b.albumIds[0];
    const alb = await ddb.collection('albums').findOne({ _id: alb0 });
    console.log('  albumIds[0] = ' + alb0 + ' → albums 里' + (alb ? '能找到 ✅（外键没烂）' : '找不到 ❌'));
    if (!alb) spotFail.push('album-fk-broken');

    const usr = await ddb.collection('users').findOne({ _id: b.userId });
    console.log('  userId = ' + b.userId + ' → users 里' + (usr ? '能找到 ✅' : '找不到 ❌'));
    if (!usr) spotFail.push('user-fk-broken');

    if (b.championAlbumId) {
      const ch = await ddb.collection('albums').findOne({ _id: b.championAlbumId });
      console.log('  championAlbumId = ' + b.championAlbumId + ' → albums 里' + (ch ? '能找到 ✅' : '找不到 ❌'));
      if (!ch) spotFail.push('champion-fk-broken');
    }
    // 反向：淘汰赛场次里的胜方专辑也必须搬过来了
    const ms = await ddb.collection('battlematches').findOne({ battleId: b._id, winnerAlbumId: { $ne: null } });
    if (ms) {
      const w = await ddb.collection('albums').findOne({ _id: ms.winnerAlbumId });
      console.log('  battlematches 胜方 winnerAlbumId → albums 里' + (w ? '能找到 ✅' : '找不到 ❌'));
      if (!w) spotFail.push('winner-fk-broken');
    }
  }
} catch (e) {
  console.log('  ❌ 抽检本身出错：' + e.message);
  spotFail.push('spot-error');
}
if (spotFail.length) failCount += spotFail.length;

console.log('\n════ 结果：' + okCount + ' 个集合成功 / ' + failCount + ' 个失败 ════');
if (failCount) {
  console.log('❌ 有失败项，请把上面输出发出来再排查。');
} else {
  console.log('✅ 全部搬完。索引不用搬 —— 后端连上 Atlas 时会按 schema 自动建。');
  console.log('   下一步：把 Render 的 MONGODB_URI 设成目标连接串，看 /ready 是否返回 ok。');
}
await src.close();
await dst.close();
process.exit(failCount ? 1 : 0);
