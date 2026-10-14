#!/usr/bin/env node
/**
 * 第四十批 · 语种筛选验收（独立判据，跑真库）
 * ===================================================================
 * ⚠️ 自检纪律（2026-10-14 刚栽过一次，写在 memory 里）：
 *    **验证"分类是否正确"时，不能用被验证的那个分类器当裁判。**
 *    上一轮的探针用 `languageTagOf(x) !== 'mandarin'` 判漏筛，
 *    而 languageTagOf 正是被怀疑的规则 ⇒ 必然查不出 ⇒ 假绿。
 *    本脚本的判据全部**独立于被测规则**：
 *      ① 用户截图里点名的两位歌手（用户给的事实）
 *      ② 人工常识标注的黄金集（本文件里写死的 GOLD 表，不调用被测规则产出标签）
 *      ③ iTunes 自己给的流派字段（第三方数据，不是我们的判定）
 *
 * 用法：node scripts/verify-language-filter.mjs
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const { resolvePool } = await import('../src/modules/battles/battle.service.js');
const { languageTagOf, albumScriptStats, zoneOfLang } = await import('../src/data/languageTag.js');
const { Artist, Album } = await import('../src/models/index.js');

await mongoose.connect(process.env.MONGODB_URI);

const fails = [];
const ok = (cond, msg) => {
  console.log(`   ${cond ? '√' : '×'} ${msg}`);
  if (!cond) fails.push(msg);
};

// ─────────────────────────────────────────────────────────────────────
// 黄金集：人工常识标注（**不经过被测规则**）。zh = 华语，foreign = 非华语
// 全部是知名歌手，标签不存在争议；名字写法与库里一致（繁体取自 iTunes 港区）。
// ─────────────────────────────────────────────────────────────────────
const GOLD = [
  // —— 确属欧美（iTunes 港区给了中文译名，旧规则会误判成华语）——
  ['Michael Bublé & 平克勞斯貝', 'foreign'],
  ['吉爾史考特海隆 & Jamie xx', 'foreign'],
  ['戴夫・布魯貝克', 'foreign'],
  ['甸馬田', 'foreign'],
  ['馬友友', 'foreign'],
  ['Queen & 亞當藍伯特', 'foreign'],
  ['猶太祭司合唱團', 'foreign'],
  ['諾拉·瓊斯', 'foreign'],
  ['綠洲樂隊', 'foreign'],
  ['魔力紅樂團', 'foreign'],
  ['樂洛伊小子 & Justin Bieber', 'foreign'],
  ['Lady Gaga & 畢烈谷巴', 'foreign'],
  ['Bob Seger & 巴布席格 銀彈合唱團', 'foreign'],
  ['西蒙和加芬克爾', 'foreign'],
  ['湯瑪斯・紐曼', 'foreign'],
  ['亞歷山大・戴斯培', 'foreign'],
  ['哈尼雅・拉尼', 'foreign'],
  ['米蘭達・藍珀特', 'foreign'],
  ['納斯‧小子', 'foreign'],
  ['添麥格羅', 'foreign'],
  ['Pat Metheny & 克羅諾斯四重奏', 'foreign'],
  ['Ólafur Arnalds & 尼爾斯・弗拉姆', 'foreign'],
  ['Tony Bennett & 戴安娜克瑞兒', 'foreign'],
  ['Max Richter, 艾琳娜・烏莉歐絲特', 'foreign'],
  ['John Legend, 莎拉·芭瑞黎絲', 'foreign'],
  ['王羽佳', 'foreign'],
  // —— 日韩 ——
  ['防彈少年團', 'foreign'],
  ['米津玄師', 'foreign'],
  ['宇多田光', 'foreign'],
  ['久石讓', 'foreign'],
  ['喜多郎', 'foreign'],
  ['菅野洋子', 'foreign'],
  // —— 确属华语 ——
  ['周杰倫', 'zh'],
  ['陳奕迅', 'zh'],
  ['張敬軒', 'zh'],
  ['衛蘭', 'zh'],
  ['陳柏宇', 'zh'],
  ['關淑怡', 'zh'],
  ['張惠妹', 'zh'],
  ['鄧紫棋', 'zh'],
  ['頑童MJ116', 'zh'],
  ['布瑞吉Bridge', 'zh'],
  ['椅子樂團', 'zh'],
  ['熊仔 & 豹子膽', 'zh'],
  ['林家謙', 'zh'],
  ['薛凱琪', 'zh'],
  ['側田', 'zh'],
  ['周柏豪', 'zh'],
  ['麥浚龍 & 謝安琪', 'zh'],
  ['孫盛希', 'zh'],
  ['林奕匡', 'zh'],
  ['馮允謙', 'zh'],
  ['洪嘉豪', 'zh'],
  ['MC 張天賦', 'zh'],
  ['李浩瑋', 'zh'],
  ['莫宰羊, Tyson Yoshi', 'zh'],
  ['D.N.A, 張藝興', 'zh'],
  ['五月天', 'zh'],
  ['JOLIN蔡依林', 'zh'],
  ['林俊傑', 'zh'],
  ['張學友', 'zh'],
  ['王力宏', 'zh'],
  ['告五人', 'zh'],
  ['毛不易', 'zh'],
  ['薛之謙', 'zh'],
  ['落日飛車 Sunset Rollercoaster', 'zh'],
  ['Know Know & AR劉夫陽', 'zh'],
];

// ⚠️ 必须把 aliases 一起选出来：②-2 规则靠它生效，漏选就会误报"覆盖率 0"（取样坑）
const artists = await Artist.find({}).select('artistId name genre region aliases').lean();
const albums = await Album.find({ isEligible: true }).select('artistExternalId name').lean();
const titlesByArtist = new Map();
for (const al of albums) {
  const k = Number(al.artistExternalId);
  if (!titlesByArtist.has(k)) titlesByArtist.set(k, []);
  titlesByArtist.get(k).push(String(al.name || ''));
}
const norm = (s) => String(s || '').replace(/\s/g, '');
/**
 * ⚠️ 库里**同名歌手不止一个 doc**（实测「馬友友」有两个，一个有 53 张专辑、一个 0 张）。
 * 取专辑最多的那个来判定 —— 0 张专辑的 doc 拿不到证据，会走"维持原判"分支，
 * 拿它当样本等于白测（第四十批改 【1】 时才发现的取样坑）。
 */
const findArtist = (nm) => {
  const t = norm(nm);
  const cands = artists.filter((a) => norm(a.name) === t);
  const pool = cands.length ? cands : artists.filter((a) => norm(a.name).includes(t));
  return pool.sort(
    (x, y) => (titlesByArtist.get(Number(y.artistId)) || []).length - (titlesByArtist.get(Number(x.artistId)) || []).length,
  )[0];
};

console.log(`\n库：${artists.length} 位歌手 / ${albums.length} 张合格专辑\n`);

// ═════════════════════════════════════════════════════════════════════
console.log('【1】黄金集（人工标注，' + GOLD.length + ' 条）—— 逐条对判定结果');
// ═════════════════════════════════════════════════════════════════════
const wrong = [];
let hitN = 0;
for (const [nm, want] of GOLD) {
  const a = findArtist(nm);
  if (!a) continue;
  hitN += 1;
  const titles = titlesByArtist.get(Number(a.artistId)) || [];
  const lang = languageTagOf(a, titles);
  const got = lang === 'mandarin' || lang === 'cantonese' ? 'zh' : 'foreign';
  const good = got === want;
  if (!good) wrong.push({ nm, want, got, lang, a, titles });
}
console.log(`   命中库里 ${hitN} 条`);
for (const w of wrong) {
  console.log(
    `   × ${w.nm}  应为 ${w.want} 实判 ${w.got}(${w.lang})  genre=${w.a.genre || '-'}  汉字标题占比=${albumScriptStats(w.titles).ratio.toFixed(2)}(${w.titles.length}张)`,
  );
}
ok(
  wrong.length === 0,
  `黄金集 ${hitN} 条全部判对（错 ${wrong.length} 条）`,
);

// ═════════════════════════════════════════════════════════════════════
console.log('\n【2】用户报的两位（用户截图给的事实）—— 必须被挡在华语区外');
// ═════════════════════════════════════════════════════════════════════
for (const nm of ['Michael Bublé & 平克勞斯貝', '吉爾史考特海隆 & Jamie xx']) {
  const a = findArtist(nm);
  const titles = titlesByArtist.get(Number(a.artistId)) || [];
  const lang = languageTagOf(a, titles);
  const zone = lang === 'mandarin' || lang === 'cantonese' ? 'zh' : 'foreign';
  ok(zone === 'foreign', `${nm} → ${lang}（不在华语区）`);
}

// ═════════════════════════════════════════════════════════════════════
console.log('\n【3】用户原始参数复现：年代 2025-2026 · 华语区 · 48 张');
// ═════════════════════════════════════════════════════════════════════
const r = await resolvePool({ scopeType: 'era', startYear: 2025, endYear: 2026, zone: 'zh', albumCount: 48 });
const poolIds = r.artists.map((a) => Number(a.artistId));
const poolDocs = await Artist.find({ artistId: { $in: poolIds } }).select('artistId name genre').lean();
const docById = new Map(poolDocs.map((d) => [Number(d.artistId), d]));
console.log(`   池内 ${r.artists.length} 位歌手 / ${r.albums.length} 张专辑`);
/** 独立判据：名字含拉丁字母 且 流派不带任何华语标记 且 专辑标题几乎无汉字 ⇒ 可疑欧美 */
const ZH_GENRE = /廣東|广东|粵語|粤语|國語|国语|華語|华语|中文|cantopop|mandopop/;
const suspects = [];
for (const a of r.artists) {
  const d = docById.get(Number(a.artistId)) || {};
  const titles = (titlesByArtist.get(Number(a.artistId)) || []);
  const st = albumScriptStats(titles);
  const latinInName = /[A-Za-z]/.test(String(d.name || ''));
  const hanInName = /[\u4e00-\u9fff]/.test(String(d.name || ''));
  if (!ZH_GENRE.test(String(d.genre || '')) && st.ratio < 0.15 && (latinInName || hanInName)) {
    suspects.push({ name: d.name, genre: d.genre, st, titles });
  }
}
for (const s of suspects) {
  console.log(`   × 可疑：${s.name}  genre=${s.genre || '-'}  汉字标题占比=${s.st.ratio.toFixed(2)}(${s.st.n}张)  例：${s.titles.slice(0, 2).join(' / ')}`);
}
ok(suspects.length === 0, `华语区池内可疑欧美歌手 = 0（实为 ${suspects.length}）`);

// ═════════════════════════════════════════════════════════════════════
console.log('\n【4】外语区池内不得出现"流派带华语标记"的歌手（流派是 iTunes 的第三方数据）');
// ═════════════════════════════════════════════════════════════════════
const rf = await resolvePool({ scopeType: 'era', startYear: 2025, endYear: 2026, zone: 'foreign', albumCount: 48 });
const rfDocs = await Artist.find({ artistId: { $in: rf.artists.map((a) => Number(a.artistId)) } })
  .select('artistId name genre')
  .lean();
const zhMarked = rfDocs.filter((d) => ZH_GENRE.test(String(d.genre || '')));
for (const d of zhMarked) console.log(`   × ${d.name}  genre=${d.genre}`);
ok(zhMarked.length === 0, `外语区池内华语流派歌手 = 0（实为 ${zhMarked.length}）`);

// ═════════════════════════════════════════════════════════════════════
console.log('\n【5】拿不到专辑数据时行为不变（genreExpand / 人格画像这两处不传专辑）');
// ═════════════════════════════════════════════════════════════════════
// ⚠️ 断言写法：region='hk' 下汉字名是 **cantonese**（港澳），不是 mandarin。
//    这里真正要断言的是"大区没变"，所以比 zoneOfLang，不写死具体语种。
ok(
  zoneOfLang(languageTagOf({ name: '平克勞斯貝', genre: '', region: 'hk' })) === 'zh',
  'languageTagOf({平克勞斯貝}) 无专辑数据时仍属华语区（旧行为保留）',
);
ok(
  zoneOfLang(languageTagOf({ name: '平克勞斯貝', genre: '', region: 'hk' }, ['Christmas', 'Bing & Ella'])) ===
    'foreign',
  'languageTagOf({平克勞斯貝}, 全拉丁专辑名) → 外语区（新证据生效）',
);
ok(
  languageTagOf({ name: '周杰倫', genre: '', region: 'hk' }, ['范特西', '七里香']) === 'mandarin',
  'languageTagOf({周杰倫}, 汉字专辑名) → mandarin（不被误伤）',
);

// ═════════════════════════════════════════════════════════════════════
console.log('\n【6】歌手重复出现：同一参数跑 6 次，歌手集合不能每次都一样');
// ═════════════════════════════════════════════════════════════════════
/**
 * ⚠️ 取样要挑**歌手数远多于张数**的场景，否则洗牌没有意义：
 *    第一次用「搖滾」流派实测池内只有 1 位歌手 ⇒ 6 次跑出 1 种集合，
 *    **看起来像 shuffle 没生效，其实是没东西可洗**（又是"取样坑"）。
 *    改用年代模式宽区间（歌手上百位），cap 32 ⇒ 每次抽 32 位，洗牌才看得出差别。
 */
const runs = [];
for (let i = 0; i < 6; i += 1) {
  const x = await resolvePool({ scopeType: 'era', startYear: 1995, endYear: 2020, zone: '', albumCount: 32 });
  runs.push(x.artists.map((a) => Number(a.artistId)).sort((p, q) => p - q));
}
const sigs = new Set(runs.map((s) => s.join(',')));
const firstSet = new Set(runs[0]);
let alwaysSame = 0;
for (const id of firstSet) {
  if (runs.every((s) => s.includes(id))) alwaysSame += 1;
}
console.log(`   6 次跑出 ${sigs.size} 种不同歌手集合；每次 ${runs[0].length} 位歌手`);
console.log(`   6 次全都出现的歌手：${alwaysSame} / ${firstSet.size}`);
ok(sigs.size >= 5, `歌手集合不再固定（不同集合 ${sigs.size}/6）`);
ok(
  runs.every((s) => s.length === runs[0].length),
  '每次歌手数一致（只改顺序，不改张数/人数）',
);

// ═════════════════════════════════════════════════════════════════════
console.log('\n【7】全库重分类清单（本次被改判为"非华语"的汉字名歌手，供人工复核）');
// ═════════════════════════════════════════════════════════════════════
const changed = [];
for (const a of artists) {
  if (!/[\u4e00-\u9fff]/.test(String(a.name || ''))) continue;
  const titles = titlesByArtist.get(Number(a.artistId)) || [];
  const before = languageTagOf(a); // 旧行为：不传专辑
  const after = languageTagOf(a, titles);
  if (before !== after) changed.push({ a, before, after, titles });
}
// 别名覆盖率体检：②-2 那条规则要靠 aliases 才生效，库里没回写就是死代码
const withAlias = artists.filter((a) => Array.isArray(a.aliases) && a.aliases.length).length;
console.log(`\n   别名覆盖率：${withAlias}/${artists.length} 位歌手带 aliases（②-2 规则的数据基础）`);
ok(withAlias > 0, '库里存在 aliases 数据（②-2 规则不是死代码）');

console.log(`   共 ${changed.length} 位（名字含汉字且判定发生变化）：`);
for (const c of changed) {
  const s = albumScriptStats(c.titles);
  console.log(
    `   ${c.before} → ${c.after}  ${(c.a.genre || '-').slice(0, 16).padEnd(18)} ${c.a.name.slice(0, 30).padEnd(32)} 汉字 ${s.ratio.toFixed(2)}｜假名 ${s.kanaN}/${s.n}｜谚文 ${s.hangulN}/${s.n}`,
  );
}

// ── 假名阈值定标：日本歌手 vs 欧美歌手（欧美专辑常有日本盘特供名）────────────
console.log('\n【8】假名占比定标（日语歌手 vs 欧美歌手）—— 用来定 kana 阈值');
const KANA_PROBE = [
  ['久石讓', 'jp'],
  ['喜多郎', 'jp'],
  ['菅野洋子', 'jp'],
  ['宇多田光', 'jp'],
  ['米津玄師', 'jp'],
  ['星野源', 'jp'],
  ['藤井風', 'jp'],
  ['Official鬍子男dism', 'jp'],
  ['魔力紅樂團', 'west'],
  ['Queen & 亞當藍伯特', 'west'],
  ['綠洲樂隊', 'west'],
  ['諾拉·瓊斯', 'west'],
  ['Michael Bublé & 平克勞斯貝', 'west'],
];
const kanaRows = [];
for (const [nm, want] of KANA_PROBE) {
  const a = findArtist(nm);
  if (!a) continue;
  const t = titlesByArtist.get(Number(a.artistId)) || [];
  const s = albumScriptStats(t);
  kanaRows.push({ nm, want, s, n: t.length });
  console.log(
    `   ${want.padEnd(5)} ${nm.slice(0, 24).padEnd(26)} 假名 ${String(s.kanaN).padStart(3)}/${String(s.n).padStart(3)} = ${(s.n ? s.kanaN / s.n : 0).toFixed(2)}`,
  );
}
const jpMin = Math.min(...kanaRows.filter((r) => r.want === 'jp' && r.n > 0).map((r) => r.s.kanaN / r.n));
const westMax = Math.max(...kanaRows.filter((r) => r.want === 'west' && r.n > 0).map((r) => r.s.kanaN / r.n));
console.log(`   ⇒ 日语歌手最低 ${jpMin.toFixed(2)} ｜ 欧美歌手最高 ${westMax.toFixed(2)}`);
console.log(
  jpMin > westMax
    ? `   ⇒ 可分，阈值取两者之间`
    : `   ⇒ **不可分**（两组重叠）⇒ 代码里已据此**删除**"见假名即判日语"的推断`,
);
// 真正要断言的是**结果行为**：欧美歌手不能因为一张日本盘专辑名被判成日语
const m5 = findArtist('魔力紅樂團');
const m5lang = languageTagOf(m5, titlesByArtist.get(Number(m5.artistId)) || []);
ok(
  zoneOfLang(m5lang) === 'foreign' && m5lang !== 'japanese',
  `魔力紅樂團(Maroon 5) 判 ${m5lang}，未被日本盘专辑名误判成日语`,
);
// 反过来：这几位此前**漏进华语区**的日本音乐人，现在必须回到外语区
for (const nm of ['久石讓', '喜多郎', '菅野洋子']) {
  const a = findArtist(nm);
  const lang = languageTagOf(a, titlesByArtist.get(Number(a.artistId)) || []);
  ok(zoneOfLang(lang) === 'foreign', `${nm} 判 ${lang}（此前是 cantonese，漏在华语区）`);
}

console.log(`\n${'═'.repeat(64)}`);
console.log(fails.length ? `❌ 未通过 ${fails.length} 项：` : '✅ 全部通过');
for (const f of fails) console.log(`   · ${f}`);

await mongoose.disconnect();
process.exit(fails.length ? 1 : 0);
