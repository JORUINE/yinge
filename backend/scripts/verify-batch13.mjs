/**
 * 第十三批自检（2026-09-24）—— 后端侧
 * ============================================================
 * 起因（用户）：「白名单里说没有 The Weeknd，但下面显示它入库了」
 *   → 同一件事两处两种口径：discoverGenreArtists 按 **artistId** 判（说已入库），
 *     whitelistOfGenre / 组池 / chip 计数 只比**名字**（说未入库）。
 *   而 iTunes **hk 区**存的是本地化名/繁简差异写法（The Weeknd→`Abel Tesfaye`、
 *   Maroon 5、房東的貓→房东的猫、萬妮達→万妮达），只比名字必漏。
 * 本脚本断言「三处口径已经统一 + 19 册全部内置」：
 *   A. 每册白名单 cached === total（真调 whitelistOfGenre）
 *   B. listGenres 的 chip 人数 === 白名单册大小（与 A 同源）
 *   C. 别名机制本身：库里那位歌手的 aliases 里确实记着白名单写法
 * 运行：cd backend && node scripts/verify-batch13.mjs   （需本地 mongod 在 27017）
 */
import assert from 'node:assert/strict';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { Artist } from '../src/models/index.js';
import { GENRE_WHITELIST, EXTRA_LISTS, whitelistNamesFor, artistMatchesWhitelistName } from '../src/data/genreWhitelist.js';
import { whitelistOfGenre, normalizeGenre } from '../src/modules/music/genreExpand.js';
import { listGenres } from '../src/modules/music/music.service.js';

let pass = 0;
let fail = 0;
const ok = (label, c, extra = '') => {
  if (c) {
    pass += 1;
    console.log(`  ✅ ${label}${extra ? '  ' + extra : ''}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${extra ? '  ' + extra : ''}`);
  }
};

await connectDb();
const books = { ...GENRE_WHITELIST, ...EXTRA_LISTS };
const bookKeys = Object.keys(books);

console.log('\n=== A. 每册白名单 100% 内置（真调 whitelistOfGenre）===');
let allCached = true;
const shortages = [];
for (const key of bookKeys) {
  const names = whitelistNamesFor(key, normalizeGenre);
  if (!names.length) continue;
  // eslint-disable-next-line no-await-in-loop
  const r = await whitelistOfGenre(key);
  const miss = r.artists.filter((a) => !a.cached).map((a) => a.name);
  if (r.cached !== r.total) {
    allCached = false;
    shortages.push(`${key}: ${r.cached}/${r.total} 缺 [${miss.join('、')}]`);
  }
  console.log(`  ${r.cached === r.total ? '✅' : '❌'} ${key}: ${r.cached}/${r.total}`);
}
ok('19 册全部 cached === total（含华南语/古典/乡村等边角册）', allCached, shortages.length ? '\n     ' + shortages.join('\n     ') : '');

console.log('\n=== B. chip 人数与白名单册大小（同口径，不再自相矛盾）===');
const raw = await listGenres();
/** ⚠️ 注意形状：service 返回**数组**，controller 才包成 { list }。
 *  第一版这里只读 .list → 拿到空数组 → 断言**假通过**（循环空转）。
 *  这种"空集合上恒真"的假绿必须防住：下面显式断言条数 > 0。 */
const list = Array.isArray(raw) ? raw : raw?.list || [];
ok('listGenres 取到了流派列表（防"空数组上恒真"的假通过）', list.length > 0, `实得 ${list.length} 条`);
let chipOk = true;
const chipBad = [];
for (const g of list) {
  const names = whitelistNamesFor(g.genre, normalizeGenre);
  if (!names.length) continue;
  /**
   * ⚠️ 2026-09-25 改（不是放水，是设计变了）：
   * 第二十一批起，chip 人数 = **册子白名单人数 + 管理员在后台手动归入的歌手数**（`manualAdded`）。
   * 所以等式应是 `artists === whitelistTotal + manualAdded`；仍要求**完全相等**，
   * 只是把"手动加的人"这一项显式算进去 —— 这样它依然能抓出"漏数/多数"。
   */
  if (g.artists !== g.whitelistTotal + (g.manualAdded || 0)) {
    chipOk = false;
    chipBad.push(
      `${g.genre}: chip ${g.artists} ≠ 册子 ${g.whitelistTotal} + 手动 ${g.manualAdded || 0}`,
    );
  }
}
ok('每个 chip 的「N 位歌手」=== 该册白名单人数（全内置时相等）', chipOk, chipBad.length ? '\n     ' + chipBad.join('\n     ') : '');
/**
 * 芯片条数：23 册里「粤语乐队」是**并进「广东歌/香港流行樂」的子册**（EXTRA_MERGE），
 * 本身不单独成 chip —— 所以 22 条才是对的（不是 23）。这条断言把"少一条"的疑问钉死。
 */
const hasYue = list.some((g) => /粤语乐队/.test(g.genre));
ok(`流派列表 = 22 条（23 册 − 只做合并的「粤语乐队」）且不含「粤语乐队」chip`,
  list.length === 22 && !hasYue, `实得 ${list.length} 条${hasYue ? '（含粤语乐队，与设计不符）' : ''}`);

console.log('\n=== C. 别名机制（用户报的那条的具体案例）===');
const wk = await Artist.findOne({ artistId: 479756766 }).select('name aliases').lean();
ok('The Weeknd 那条：库里名字不是 The Weeknd，但 aliases 记着白名单写法',
  Boolean(wk) && (wk.aliases || []).some((x) => /weeknd/i.test(x)),
  wk ? `库里 name=${JSON.stringify(wk.name)} aliases=${JSON.stringify(wk.aliases)}` : '未找到 artistId=479756766');
ok('别名感知判定：artistMatchesWhitelistName(库里的它, "The Weeknd") === true',
  Boolean(wk) && artistMatchesWhitelistName(wk, 'The Weeknd'));

await disconnectDb();
console.log(`\n===== 第十三批后端自检：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
