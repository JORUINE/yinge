/**
 * 组合数据体检（2026-09-23）
 * ------------------------------------------------------------
 * 起因：用户报「对位赛选陶喆+林俊杰，出来的专辑却是王菲、李克勤」。
 * 前端 `artistPool` 是按 artistId 缓存的，所以只要组合里存的
 * `{ artistId, name }` **自己对不上**（名字写林俊杰、id 指向李克勤），
 * 界面就会显示「已选 林俊杰」但加载李克勤的专辑 —— 症状与用户描述完全吻合。
 *
 * 本脚本：把每个组合的 artist 明细，与歌手库（Artist.artistId → name）逐条核对。
 * 只读，不改任何数据。
 *
 * 用法：node scripts/diag-combos.mjs      （需本地 mongod 在 27017）
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { Combo, Battle } from '../src/models/index.js';
import { Artist } from '../src/models/index.js';

const line = (s) => console.log(s);

async function main() {
  await connectDb();

  const combos = await Combo.find({}).sort({ isSystem: 1, createdAt: -1 }).lean();
  line(`\n===== 全部组合 ${combos.length} 个（系统 + 用户自建）=====`);
  let bad = 0;
  for (const c of combos) {
    const parts = [];
    let mismatch = false;
    for (const a of c.artists || []) {
      const n = Number(a.artistId);
      const idOk = Number.isFinite(n) && n > 0;
      const real = idOk ? await Artist.findOne({ artistId: n }).select('name').lean() : null;
      const realName = real?.name || '（库里没有这位歌手）';
      const ok = idOk && real && real.name === a.name;
      if (!ok) mismatch = true;
      parts.push(
        `${a.name}#${a.artistId}${idOk ? '' : ' ⚠️ID非法'}→库中:${realName}${ok ? '' : '  ❌对不上'}`,
      );
    }
    if (mismatch) bad += 1;
    line(
      `${mismatch ? '❌' : '✅'} [${c.isSystem ? '系统' : '自建'}/${c.scopeType}] ${c.label}  (${c.artists?.length || 0} 位)\n     ${parts.join('\n     ')}`,
    );
  }
  line(`\n>>> 名字/ID 对不上的组合：${bad} / ${combos.length}`);

  // 顺带看看最近的 battle 里 artists 是否也有同样的错配
  const recent = await Battle.find({ 'artists.1': { $exists: true } })
    .sort({ createdAt: -1 })
    .limit(8)
    .select('scopeType artists createdAt')
    .lean();
  line(`\n===== 最近 ${recent.length} 局带多歌手的对决 =====`);
  for (const b of recent) {
    const parts = [];
    for (const a of b.artists || []) {
      const real = await Artist.findOne({ artistId: Number(a.artistId) }).select('name').lean();
      const ok = real && real.name === a.name;
      parts.push(`${a.name}#${a.artistId}${ok ? '' : `(库中:${real?.name || '—'})❌`}`);
    }
    line(`[${b.scopeType}] ${parts.join('  |  ')}`);
  }

  await disconnectDb();
}

main().catch(async (e) => {
  console.error('诊断失败：', e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
