/**
 * 清理「自检」垃圾组合（2026-09-23）
 * ------------------------------------------------------------
 * 起因：用户报「对位赛选陶喆+林俊杰，出来的专辑却是王菲、李克勤」。
 * 诊断（scripts/diag-combos.mjs）定位到 4 个自检脚本遗留的用户组合，
 * 其 `{ artistId, name }` 本身错配：
 *     周杰伦#368904535 → 库里 368904535 其实是「李克勤」
 *     陶喆#41760704   → 库里 41760704  其实是「王菲」
 * 前端 artistPool 按 artistId 取专辑，于是：**界面显示"已选周杰伦/陶喆"，
 * 实际加载的却是李克勤/王菲的专辑** —— 与用户描述完全一致。
 *
 * 做法：先把所有 label 以「自检」开头、且名字/ID 对不上的组合导出成 JSON 备份，
 *       再删除。只动这一类测试垃圾，不碰任何真实组合。
 *
 * 用法：node scripts/cleanup-selfcheck-combos.mjs          （只预览，不删）
 *       node scripts/cleanup-selfcheck-combos.mjs --apply  （备份 + 删除）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { Combo, Artist } from '../src/models/index.js';

const APPLY = process.argv.includes('--apply');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await connectDb();
  const all = await Combo.find({}).lean();
  const victims = [];
  for (const c of all) {
    if (!/^自检/.test(String(c.label || ''))) continue;
    let bad = false;
    for (const a of c.artists || []) {
      const real = await Artist.findOne({ artistId: Number(a.artistId) }).select('name').lean();
      if (!real || real.name !== a.name) bad = true;
    }
    victims.push({ combo: c, bad });
  }

  console.log(`\n候选（label 以「自检」开头）：${victims.length} 个`);
  for (const v of victims) {
    console.log(
      `  ${v.bad ? '❌名字/ID错配' : '✅一致'}  ${v.combo.label}  [${v.combo.scopeType}]  artists=${(v.combo.artists || [])
        .map((a) => `${a.name}#${a.artistId}`)
        .join(' | ')}`,
    );
  }

  if (!APPLY) {
    console.log('\n（预览模式，未改动任何数据；加 --apply 执行备份并删除）\n');
    await disconnectDb();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.resolve(__dirname, '../../_backup', `${stamp}_自检组合清理`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, 'combos-backup.json');
  fs.writeFileSync(backupFile, JSON.stringify(victims.map((v) => v.combo), null, 2), 'utf8');
  console.log(`\n已备份 ${victims.length} 个组合 → ${backupFile}`);

  const ids = victims.map((v) => v.combo._id);
  const r = await Combo.deleteMany({ _id: { $in: ids } });
  console.log(`已删除 ${r.deletedCount} 个自检垃圾组合`);

  await disconnectDb();
}

main().catch(async (e) => {
  console.error('清理失败：', e);
  try {
    await disconnectDb();
  } catch {}
  process.exit(1);
});
