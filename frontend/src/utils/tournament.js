/**
 * 赛制公式（前端镜像）
 * ------------------------------------------------------------
 * ⚠️ 唯一真相源：backend/src/modules/battles/bracket.js
 *    本文件是它的前端镜像，用于「创建页实时显示预计 N 步」。
 *    两处公式必须完全一致 —— 改 bracket.js 时必须同步改这里（见自检清单第 2 条）。
 *    另有一道保险：创建成功后返回的 battle.stepTotal 由后端算出，若与前端预估不一致会立刻暴露。
 *
 * 规则（v2 杯赛制）：
 *   ① 小组赛每 4 张一组（末组 1~4 张），每组选出 2 张晋级（≥3 张选 2 / 2 张选 1 / 1 张直进）
 *   ② 遗珠复活：把晋级数补齐到「不小于它的最小 2 的幂」，差额靠复活轮一次捞回
 *   ③ 淘汰赛：2 的幂张数 1v1 逐轮减半，共（规模 − 1）场
 *   ④ 总步数 = 小组赛组数 +（有复活 ? 1 : 0）+ 淘汰赛场次
 */

/** 小组赛每组张数 */
export const GROUP_PICK_SIZE = 4;
/** 每组晋级张数 */
export const GROUP_ADVANCE = 2;
/** 单场对决参赛专辑上限 */
export const MAX_POOL = 32;
/** 单歌手模式可选档位（张） */
export const SINGER_SCALES = [8, 12, 16, 24, 32];
/** 多歌手模式「每位歌手」可选档位（张） */
export const PER_ARTIST_SCALES = [4, 6, 8, 10];
export const DEFAULT_SINGER_SCALE = 16;
export const DEFAULT_PER_ARTIST = 8;
export const DEFAULT_ARTIST_COUNT = 3;

/** 某组的晋级张数：≥3 张选 2，2 张选 1，1 张直接晋级 */
export function advanceOfGroup(size) {
  return size >= 3 ? GROUP_ADVANCE : 1;
}

/** 解析「目标总张数」：多歌手 = 每位张数 × 歌手数；单歌手 = 所选档位；一律封顶 MAX_POOL */
export function resolvePoolSize({ singerScale, perArtist, artistCount } = {}) {
  const target =
    perArtist && artistCount ? perArtist * artistCount : Number(singerScale) || DEFAULT_SINGER_SCALE;
  return Math.max(2, Math.min(target, MAX_POOL));
}

/**
 * 赛制规划（纯函数）：由参赛专辑数算出完整赛程安排。
 * 与后端 planTournament 逐行等价。
 */
export function planTournament(total) {
  const t = Math.floor(Number(total) || 0);
  if (t < 2) return null;

  const groupSizes = [];
  for (let i = 0; i < t; i += GROUP_PICK_SIZE) {
    groupSizes.push(Math.min(GROUP_PICK_SIZE, t - i));
  }
  const advancePerGroup = groupSizes.map(advanceOfGroup);
  const qualified = advancePerGroup.reduce((a, b) => a + b, 0);

  let knockoutSize = 1;
  while (knockoutSize < qualified) knockoutSize *= 2;
  const revivalNeed = knockoutSize - qualified;

  const groupSteps = groupSizes.filter((s) => s > 1).length; // 只有 1 张的组自动晋级，不算一步
  const revivalSteps = revivalNeed > 0 ? 1 : 0;
  const knockoutMatches = knockoutSize - 1;

  return {
    total: t,
    groupSizes,
    groupCount: groupSizes.length,
    advancePerGroup,
    qualified,
    revivalNeed,
    knockoutSize,
    groupSteps,
    revivalSteps,
    knockoutMatches,
    totalSteps: groupSteps + revivalSteps + knockoutMatches,
  };
}

/** 淘汰赛轮次名（与后端一致）：32/16/8/4/2 → r32/r16/qf/semi/final */
export function roundNameFor(participants) {
  if (participants >= 32) return 'r32';
  if (participants >= 16) return 'r16';
  if (participants >= 8) return 'qf';
  if (participants >= 4) return 'semi';
  return 'final';
}

/** 淘汰赛轮次中文名 */
export const ROUND_CN = {
  group: '小组赛',
  revival: '遗珠复活',
  r32: '32 强',
  r16: '16 强',
  qf: '8 强',
  semi: '半决赛',
  final: '决赛',
  duel: '指定对决',
};

/** 一句话赛程摘要（创建页开始条用），例：3 组小组赛 · 复活捞 2 · 8 强淘汰赛 · 共 11 步 */
export function describePlan(plan) {
  if (!plan) return '';
  const parts = [`${plan.groupCount} 组小组赛（每组 ${GROUP_PICK_SIZE} 张选 ${GROUP_ADVANCE}）`];
  if (plan.revivalNeed > 0) parts.push(`遗珠复活捞 ${plan.revivalNeed} 张`);
  parts.push(`${plan.knockoutSize} 强淘汰赛`);
  return `${parts.join(' → ')} · 共 ${plan.totalSteps} 步`;
}
