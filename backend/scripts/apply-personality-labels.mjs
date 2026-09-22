/**
 * 一次性改写人格题库 42 道选择题（D1 负向出口 + D2 去可猜），确定性、幂等、带校验。
 *  - 按 (order, key) 精确替换 A/B/C/D 的 label（score 原样保留，绝不动计分）；
 *  - 对标记了 E 的题，若该题 options 里尚无 E，则在 `],` 之前插入 E 负向选项（score { <dim>: -3 }）。
 *  - 写盘前做校验：① 每行选项必须仍是合法结构 ② 不得出现重复 label ③ 目标题 label 已就位 ④ E 已就位。
 *  - `--apply` 才真正写回 src/data/personality.js；否则只生成临时文件并打印校验结果。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const file = fileURLToPath(new URL('../src/data/personality.js', import.meta.url));
const tmp = fileURLToPath(new URL('../src/data/personality.generated.js', import.meta.url));
const apply = process.argv.includes('--apply');

let src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

// order -> { A,B,C,D 新标签；可选 E: { label, dim } }
const MAP = {
  // ───── melody ─────
  1: { A: '那句副歌一出来，整个人就对了', B: '一开嗓那个声音质感先抓住我', C: '鼓点一进来，身体先醒', D: '某句词突然戳到我', E: { label: '没有特别记住哪一下，听完就过去了', dim: 'melody' } },
  2: { A: '旋律怎么走的，我最先注意到', B: '谁唱的、声音什么质地', C: '它到底在讲什么', D: '整首歌笼着什么气氛' },
  3: { A: '听一遍差不多就能跟着哼', B: '得二三遍才跟得上', C: '只记得住最抓耳的那一句', D: '我通常不跟着哼，就静静听', E: { label: '旋律对我没那么重要，记不记得都行', dim: 'melody' } },
  4: { A: '谁把旋律唱得更顺耳', B: '谁的版本更让人耳目一新', C: '谁把词唱得更走心', D: '谁的声音更经得起反复听' },
  5: { A: '会不会想再听一遍', B: '有没有让我起鸡皮疙瘩', C: '写法巧不巧、新不新', D: '情绪落没落到我心里' },
  6: { A: '副歌那一段，挥之不去', B: '某个节奏型，一直循环', C: '某一句词，突然蹦出来', D: '某个音色，或者那股混响', E: { label: '想不起来，旋律没在我这留痕', dim: 'melody' } },
  7: { A: '「你先听副歌，这段绝了」', B: '「你听这句词，写得太准」', C: '「你听这个鼓、这个合成器」', D: '「你听这个氛围，很对味」' },
  8: { A: '旋律太平，听完什么都没留下', B: '编曲糊成一团，分不清层次', C: '词写得很敷衍，像凑的', D: '一直很吵，让人喘不过气', E: { label: '旋律本身好坏，我其实不太挑', dim: 'melody' } },
  // ───── rhythm ─────
  9: { A: '脚会不自觉跟着点', B: '头会跟着晃', C: '就静静听，不太会动', D: '会跟着哼起旋律', E: { label: '身体没什么反应，坐着听就挺好', dim: 'rhythm' } },
  10: { A: '够不够带劲、能让人动', B: '够不够好听、顺耳', C: '够不够耐听、能反复放', D: '够不够新鲜、没听过' },
  11: { A: '运动、走路的时候', B: '写东西、干活需要提神的时候', C: '心里憋着、想发泄的时候', D: '我很少专门找强节奏的歌', E: { label: '强节奏反而让我更烦躁', dim: 'rhythm' } },
  12: { A: '一下就能听出来', B: '反复听会有点感觉', C: '基本听不出来', D: '我更关注别的地方' },
  13: { A: '现场的热度与律动，能嗨起来', B: '唱功与音准，稳不稳', C: '编曲与音响层次够不够满', D: '能不能安静听清每个细节' },
  14: { A: '有点着急，想切掉', B: '正好，我就喜欢慢的', C: '看歌词写得好不好', D: '看制作里有没有细节', E: { label: '我其实不太被节奏带动', dim: 'rhythm' } },
  15: { A: '好几个，专门按场景分', B: '有一两个', C: '很少，我不按场景分', D: '几乎不建歌单' },
  // ───── lyric ─────
  16: { A: '经常，还会截图存下来', B: '偶尔会，心里默念', C: '很少，旋律抓住我就够了', D: '基本不记词，当背景听', E: { label: '词写得好坏，我不太在意', dim: 'lyric' } },
  17: { A: '词写的就是我想说的话', B: '旋律正好落在那个情绪上', C: '编曲把情绪垫起来了', D: '声音一听就让人安心' },
  18: { A: '会，一定要知道在唱什么', B: '只查最喜欢的几首', C: '不查，当人声乐器听', D: '无所谓，好听就行' },
  19: { A: '照样收藏，词就够了', B: '听几次就放下了', C: '会自己改着哼', D: '看当下的心情', E: { label: '词我基本不抠，旋律顺耳就行', dim: 'lyric' } },
  20: { A: '写过，或者抄在本子上', B: '发过动态或者朋友圈', C: '只在心里想过', D: '没有过' },
  21: { A: '重要，我喜欢有故事的歌', B: '有一点，但别太啰嗦', C: '不重要，我只要听感', D: '不重要，我要的是能跳起来' },
  22: { A: '写得很准，像在说我的事', B: '写得很开阔，像电影台词', C: '写得怪，角度很新', D: '我不太会被文字打动', E: { label: '文字打动不了我，听着对味就行', dim: 'lyric' } },
  // ───── texture ─────
  23: { A: '会，能听出混音好不好', B: '有一点，糊了会难受', C: '不太留意，听歌不看这些', D: '完全不在意', E: { label: '制作细节我基本听不出来', dim: 'texture' } },
  24: { A: '听得出来，差别挺大', B: '隐约有点感觉', C: '听不出来', D: '我不关心是谁做的' },
  25: { A: '声场与解析，要听清层次', B: '低频够不够', C: '人声近不近，听抒情要贴耳', D: '能听就行' },
  26: { A: '特别的人声处理、和声堆叠', B: '没听过的合成器音色', C: '一把干净的木吉他', D: '很硬很实的鼓', E: { label: '音色变化我不太敏感', dim: 'texture' } },
  27: { A: '音色选择和空间感', B: '旋律写法', C: '词的水平', D: '演奏水准' },
  28: { A: '会，专门找无损、调过均衡器', B: '会换设备，但不折腾参数', C: '不会，手机外放也能听', D: '只在听某几首时才在意' },
  29: { A: '很久，我可以只听声音本身', B: '能听，但更习惯有唱', C: '听一会儿就走神', D: '得配着做事才能听', E: { label: '纯器乐我容易走神', dim: 'texture' } },
  // ───── novelty ─────
  30: { A: '一直在换，旧的很少回头', B: '隔一阵加一批新的', C: '挺稳定，就那些歌翻来覆去', D: '基本不换', E: { label: '换歌让我有点不安', dim: 'novelty' } },
  31: { A: '直接点开听', B: '先看一眼简介再说', C: '先存着，以后有空再说', D: '一般不会点' },
  32: { A: '愿意，语言不重要', B: '能接受，但会挑唱得好听的', C: '还是想听懂在唱什么', D: '不太愿意' },
  33: { A: '翻榜单、年度盘点', B: '看乐评、长文推荐', C: '靠朋友推', D: '不刻意找', E: { label: '新风格我不太主动去碰', dim: 'novelty' } },
  34: { A: '陌生的，听新的才有意思', B: '一半一半', C: '老歌，熟的才安心', D: '看当下的心情' },
  35: { A: '收藏起来，过一阵再听', B: '会研究它为什么这么写', C: '听完就算，不会收藏', D: '直接切掉', E: { label: '特别但不顺耳的，我一般直接划走', dim: 'novelty' } },
  // ───── calm ─────
  36: { A: '一个人戴耳机，关灯', B: '通勤路上塞着耳朵', C: '家里放着当背景', D: '和朋友一起，声音开大', E: { label: '太安静我会觉得空', dim: 'calm' } },
  37: { A: '听不下去，会头疼', B: '看状态，偶尔能听', C: '挺爽的，我喜欢', D: '主要看编曲有没有层次' },
  38: { A: '经常，睡前、发呆都会听', B: '偶尔', C: '我更多是用音乐提神', D: '不太会用音乐调状态' },
  39: { A: '很大，深夜才听得进去', B: '有一点', C: '没差别', D: '我白天听得多，晚上早睡了', E: { label: '白天晚上我都一样听', dim: 'calm' } },
  40: { A: '很小，够听就行', B: '中等', C: '偏大，要有包围感', D: '很大，越响越好' },
  41: { A: '小场地，能坐着听', B: '音乐节，人多热闹', C: '剧院或者音乐厅', D: '我基本不去现场' },
  42: { A: '还想再听，越听越有味道', B: '换个版本听（现场、翻唱）', C: '听腻了，去找新的', D: '听腻就切，但不影响喜欢', E: { label: '循环多了我就想换口味', dim: 'calm' } },
};

// 选项行严格正则：捕获 缩进 / key / label / score 整段
const optRe = /^(\s*)\{\s*key:\s*'([A-E])'\s*,\s*label:\s*'((?:[^'\\]|\\.)*)'\s*,\s*(score:\s*\{[^}]*\})\s*\},?\s*$/;

let curOrder = null;
const hasE = new Set();       // 该题 options 里原本就含 E
const insertedE = new Set();  // 本次插入 E 的 order
const out = [];
let labelChanged = 0;

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const om = line.match(/^\s*order:\s*(\d+)\s*,/);
  if (om) curOrder = Number(om[1]);

  const m = line.match(optRe);
  if (m && curOrder != null && MAP[curOrder]) {
    const indent = m[1];
    const key = m[2];
    if (key === 'E') { hasE.add(curOrder); out.push(line); continue; }
    const rep = MAP[curOrder][key];
    if (rep) {
      // 正则分组：1=indent 2=key 3=label 4=score；score 必须取 m[4]
      out.push(`${indent}{ key: '${key}', label: '${rep}', ${m[4]} },`);
      labelChanged += 1;
      continue;
    }
  }

  // E 插入：该题 options 闭合 `  ],` 之前，且本题标记了 E、尚未存在、尚未插入
  const closeM = line.match(/^(\s*)\],/);
  if (closeM && curOrder != null && MAP[curOrder] && MAP[curOrder].E && !insertedE.has(curOrder) && !hasE.has(curOrder)) {
    // E 选项与 A~D 同级，统一用 6 空格缩进（与文件里其它选项行一致）
    const e = MAP[curOrder].E;
    out.push(`      { key: 'E', label: '${e.label}', score: { ${e.dim}: -3 } },`);
    insertedE.add(curOrder);
  }
  out.push(line);
}

const generated = out.join('\n');

// ── 校验 ──
const genLines = generated.split('\n');
const errors = [];
let order = null;
const seenLabelsInQ = {}; // order -> [labels]
const seenKeysInQ = {};   // order -> Set(keys)

for (const ln of genLines) {
  const om = ln.match(/^\s*order:\s*(\d+)\s*,/);
  if (om) {
    order = Number(om[1]);
    seenLabelsInQ[order] = [];
    seenKeysInQ[order] = new Set();
  }
  const m = ln.match(optRe);
  if (m) {
    // 正则分组：1=indent 2=key 3=label 4=score
    const k = m[2];
    const lab = m[3];
    seenKeysInQ[order]?.add(k);
    seenLabelsInQ[order]?.push(lab);
    // 重复 label 检测（防旧脚本的「label: 'X', X」式损坏）
    const labelCount = (ln.match(/label:/g) || []).length;
    if (labelCount !== 1) errors.push(`选项行出现 ${labelCount} 个 label（损坏）: ${ln.trim()}`);
    if (!/score:\s*\{/.test(ln)) errors.push(`选项行缺少 score（损坏）: ${ln.trim()}`);
  }
}

// 核对目标题标签与 E 是否就位
for (const o of Object.keys(MAP).map(Number)) {
  const entry = MAP[o];
  const labels = seenLabelsInQ[o] || [];
  const keys = seenKeysInQ[o] || new Set();
  for (const k of ['A', 'B', 'C', 'D']) {
    if (!labels.includes(entry[k])) errors.push(`题 ${o} 的 ${k} 标签未就位（期望「${entry[k]}」）`);
  }
  if (entry.E && !keys.has('E')) errors.push(`题 ${o} 未插入 E 负向选项`);
}

// 语法检查
fs.writeFileSync(tmp, generated, 'utf8');
let syntaxOk = true;
try {
  execSync(`node --check "${tmp}"`, { stdio: 'pipe' });
} catch (e) {
  syntaxOk = false;
  errors.push('node --check 语法失败: ' + e.message.split('\n')[0]);
}

console.log('A/B/C/D 标签改写行数 :', labelChanged);
console.log('插入 E 的题序        :', [...insertedE].sort((a, b) => a - b).join(','));
console.log('语法检查             :', syntaxOk ? 'OK' : 'FAIL');
console.log('校验错误数           :', errors.length);
for (const e of errors) console.log('  ✗', e);

if (errors.length || !syntaxOk) {
  console.log('\n校验未通过，未写回原文件。临时文件：', tmp);
  process.exit(1);
}

if (apply) {
  fs.writeFileSync(file, generated, 'utf8');
  fs.unlinkSync(tmp);
  console.log('\n✅ 已写回', file);
} else {
  console.log('\n（dry-run）校验通过。加 --apply 写回原文件。');
}
