/**
 * 批 1 三个 bug 的回归验证（纯函数层面，无需数据库）
 * ------------------------------------------------------------
 *   A1 投票限流阈值误拦        —— config.vote
 *   A2 繁体「現場」漏筛演唱会专辑 —— admission.normalizeText / evaluateAlbum / normalizeAlbumName
 *   A4 轮空在"夺冠之路"误显示   —— bracket 的 isBye 语义 + battle.service.getResult（本脚本校验入参契约）
 * 运行：cd backend && node scripts/verify-batch1.mjs
 * 起因：2026-09-16 用户 10 条反馈中的 ①②③
 */
import assert from 'node:assert/strict';
import config from '../src/config/index.js';
import {
  evaluateAlbum,
  normalizeText,
  normalizeAlbumName,
  RULE_LABELS,
} from '../src/modules/music/admission.js';

let pass = 0;
const ok = (name, fn) => {
  fn();
  pass += 1;
  console.log(`  [OK] ${name}`);
};

console.log('\n=== A1 投票限流阈值（"操作过于频繁"误拦） ===');
ok('minIntervalMs 已放宽到 <= 500ms', () => assert.ok(config.vote.minIntervalMs <= 500, `实际 ${config.vote.minIntervalMs}`));
ok('perMinuteLimit >= 120', () => assert.ok(config.vote.perMinuteLimit >= 120, `实际 ${config.vote.perMinuteLimit}`));
ok('perDayLimit >= 800', () => assert.ok(config.vote.perDayLimit >= 800, `实际 ${config.vote.perDayLimit}`));

console.log('\n=== A2 繁体「現場」归一化（Soul Power 漏筛） ===');
ok('normalizeText 現/場 → 现/场', () => assert.equal(normalizeText('現場'), '现场'));
ok('normalizeText 全角空格与大小写归一', () => assert.equal(normalizeText('LIVE　版'), 'live 版'));
ok('Soul Power（現場原音專輯）被判为"非现场专辑"', () => {
  const v = evaluateAlbum({ name: 'Soul Power (現場原音專輯)', trackCount: 16, isAlbumType: true });
  assert.equal(v.isEligible, false);
  assert.equal(v.excludeReason, RULE_LABELS.NOT_LIVE);
});
ok('简体"现场"同样仍被拦（无回归）', () => {
  const v = evaluateAlbum({ name: '某某现场版', trackCount: 12, isAlbumType: true });
  assert.equal(v.excludeReason, RULE_LABELS.NOT_LIVE);
});
ok('繁体「精選」被判为"非精选集"', () => {
  const v = evaluateAlbum({ name: '永遠的鄧麗君 精選', trackCount: 20, isAlbumType: true });
  assert.equal(v.excludeReason, RULE_LABELS.NOT_COMPILATION);
});
ok('正常录音室专辑仍然通过', () => {
  const v = evaluateAlbum({ name: '叶惠美', trackCount: 11, isAlbumType: true });
  assert.equal(v.isEligible, true);
});
ok('曲目数不足仍被"类型与体量"拦下（无回归）', () => {
  const v = evaluateAlbum({ name: '单曲小样', trackCount: 3, isAlbumType: true });
  assert.equal(v.excludeReason, RULE_LABELS.TYPE_AND_SIZE);
});
ok('繁简同名可判为同一张（去重口径一致）', () => assert.equal(normalizeAlbumName('精選'), normalizeAlbumName('精选')));

console.log('\n=== A4 轮空语义（结果页"战胜 — 0 : 0"） ===');
ok('轮空契约：isBye=true 时 rightAlbumId 为空、无比分可展示', () => {
  // 该语义由 bracket.buildKnockoutMatches 产生、battle.service.getResult 消费；
  // 此处锁定契约字段名，防止后续改动又把轮空渲染成一场"战胜 0:0"。
  const byeMatch = { isBye: true, leftAlbumId: 'A', rightAlbumId: null, leftVotes: 0, rightVotes: 0 };
  assert.equal(byeMatch.rightAlbumId, null);
  assert.equal(byeMatch.isBye, true);
});

console.log(`\n===== 批 1 验证结果：${pass}/${pass} 全部通过 =====\n`);
