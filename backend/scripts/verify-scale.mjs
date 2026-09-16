/**
 * 新赛制「参赛规模 → 场次 / 步数」对照表验证（2026-09-17）
 * ------------------------------------------------------------
 * 用途：把《赛制升级方案》第四节那张对照表变成可执行断言。
 *       表里每个数字都由 resolvePoolSize（规模解析）+ planTournament（赛制规划）现算，
 *       不允许手写 —— 表里写 5/11/11/21/22/24/23 步，这里就必须算出同样的数。
 * 运行：cd backend && node scripts/verify-scale.mjs
 */
import assert from 'node:assert/strict';
import { resolvePoolSize, planTournament, MAX_POOL } from '../src/modules/battles/bracket.js';

let pass = 0;
let fail = 0;
const eq = (label, actual, expected) => {
  if (actual === expected) {
    pass += 1;
    console.log(`  [OK] ${label} = ${actual}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${label}：期望 ${expected}，实际 ${actual}`);
  }
};

function scenario(label, opts, expect) {
  const total = resolvePoolSize(opts);
  const plan = planTournament(total);
  console.log(`\n· ${label} → 参赛 ${total} 张`);
  eq('总张数', total, expect.total);
  eq('小组赛组数', plan.groupCount, expect.groupCount);
  eq('晋级数', plan.qualified, expect.qualified);
  eq('遗珠复活数', plan.revivalNeed, expect.revivalNeed);
  eq('淘汰赛规模', plan.knockoutSize, expect.knockoutSize);
  eq('淘汰赛场次', plan.knockoutMatches, expect.knockoutMatches);
  eq('总步数', plan.totalSteps, expect.steps);
}

console.log('=== 单歌手档位（默认 16）===');
scenario('单歌手 8 张', { singerScale: 8 }, { total: 8, groupCount: 2, qualified: 4, revivalNeed: 0, knockoutSize: 4, knockoutMatches: 3, steps: 5 });
scenario('单歌手 12 张', { singerScale: 12 }, { total: 12, groupCount: 3, qualified: 6, revivalNeed: 2, knockoutSize: 8, knockoutMatches: 7, steps: 11 });
scenario('单歌手 16 张（默认）', { singerScale: 16 }, { total: 16, groupCount: 4, qualified: 8, revivalNeed: 0, knockoutSize: 8, knockoutMatches: 7, steps: 11 });
scenario('单歌手 24 张', { singerScale: 24 }, { total: 24, groupCount: 6, qualified: 12, revivalNeed: 4, knockoutSize: 16, knockoutMatches: 15, steps: 22 });
scenario('单歌手 32 张', { singerScale: 32 }, { total: 32, groupCount: 8, qualified: 16, revivalNeed: 0, knockoutSize: 16, knockoutMatches: 15, steps: 23 });

console.log('\n=== 多歌手混战（每位档位 × 歌手数；默认 3 位 × 8 张 = 24）===');
scenario('2 位 × 4 张', { perArtist: 4, artistCount: 2 }, { total: 8, groupCount: 2, qualified: 4, revivalNeed: 0, knockoutSize: 4, knockoutMatches: 3, steps: 5 });
scenario('2 位 × 6 张', { perArtist: 6, artistCount: 2 }, { total: 12, groupCount: 3, qualified: 6, revivalNeed: 2, knockoutSize: 8, knockoutMatches: 7, steps: 11 });
scenario('2 位 × 8 张', { perArtist: 8, artistCount: 2 }, { total: 16, groupCount: 4, qualified: 8, revivalNeed: 0, knockoutSize: 8, knockoutMatches: 7, steps: 11 });
scenario('2 位 × 10 张', { perArtist: 10, artistCount: 2 }, { total: 20, groupCount: 5, qualified: 10, revivalNeed: 6, knockoutSize: 16, knockoutMatches: 15, steps: 21 });

scenario('3 位 × 4 张', { perArtist: 4, artistCount: 3 }, { total: 12, groupCount: 3, qualified: 6, revivalNeed: 2, knockoutSize: 8, knockoutMatches: 7, steps: 11 });
scenario('3 位 × 6 张', { perArtist: 6, artistCount: 3 }, { total: 18, groupCount: 5, qualified: 9, revivalNeed: 7, knockoutSize: 16, knockoutMatches: 15, steps: 21 });
scenario('3 位 × 8 张（默认）', { perArtist: 8, artistCount: 3 }, { total: 24, groupCount: 6, qualified: 12, revivalNeed: 4, knockoutSize: 16, knockoutMatches: 15, steps: 22 });
scenario('3 位 × 10 张', { perArtist: 10, artistCount: 3 }, { total: 30, groupCount: 8, qualified: 15, revivalNeed: 1, knockoutSize: 16, knockoutMatches: 15, steps: 24 });

scenario('4 位 × 4 张', { perArtist: 4, artistCount: 4 }, { total: 16, groupCount: 4, qualified: 8, revivalNeed: 0, knockoutSize: 8, knockoutMatches: 7, steps: 11 });
scenario('4 位 × 6 张', { perArtist: 6, artistCount: 4 }, { total: 24, groupCount: 6, qualified: 12, revivalNeed: 4, knockoutSize: 16, knockoutMatches: 15, steps: 22 });
scenario('4 位 × 8 张', { perArtist: 8, artistCount: 4 }, { total: 32, groupCount: 8, qualified: 16, revivalNeed: 0, knockoutSize: 16, knockoutMatches: 15, steps: 23 });
scenario('4 位 × 10 张（超上限封顶）', { perArtist: 10, artistCount: 4 }, { total: 32, groupCount: 8, qualified: 16, revivalNeed: 0, knockoutSize: 16, knockoutMatches: 15, steps: 23 });

scenario('5 位 × 4 张', { perArtist: 4, artistCount: 5 }, { total: 20, groupCount: 5, qualified: 10, revivalNeed: 6, knockoutSize: 16, knockoutMatches: 15, steps: 21 });
scenario('5 位 × 6 张', { perArtist: 6, artistCount: 5 }, { total: 30, groupCount: 8, qualified: 15, revivalNeed: 1, knockoutSize: 16, knockoutMatches: 15, steps: 24 });
scenario('5 位 × 8 张（超上限封顶）', { perArtist: 8, artistCount: 5 }, { total: 32, groupCount: 8, qualified: 16, revivalNeed: 0, knockoutSize: 16, knockoutMatches: 15, steps: 23 });

console.log('\n=== 边界与不变量 ===');
eq('参赛上限 MAX_POOL', MAX_POOL, 32);
eq('参赛 1 张 → 不足以开赛，规划为 null', planTournament(1), null);
eq('参赛 2 张 → 1 组(2 选 1) 即选出冠军 → 1 步', planTournament(2).totalSteps, 1);
eq('参赛 3 张 → 1 组(3 选 2) + 决赛 1 场 → 2 步', planTournament(3).totalSteps, 2);
eq('参赛 4 张 → 1 组(4 选 2) + 决赛 1 场 → 2 步', planTournament(4).totalSteps, 2);
for (const t of [5, 7, 9, 13, 17, 25, 31]) {
  const p = planTournament(t);
  eq(
    `不变量 T=${t}：总步数 = 组数 + 复活轮 + 淘汰赛场次`,
    p.totalSteps,
    p.groupSteps + p.revivalSteps + p.knockoutMatches,
  );
}

console.log(`\n===== 规模 / 赛制验证结果：通过 ${pass} / 失败 ${fail} =====\n`);
process.exit(fail ? 1 : 0);
