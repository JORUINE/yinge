/**
 * 音乐人格 · 展示常量
 * ------------------------------------------------------------
 * ⚠️ 已知口径差异（待你拍板，见改动记录）：
 *   设计稿 docs/design/音格-UI设计稿.html 用的是 6 类「旋律捕手 / 节拍动物 / 词句收藏家 /
 *   音色控 / 安静聆听者 / 探索者」（code MEL/RHY/LYR/TMB/CLM/EXP，维度偏"听感"）。
 *   而当前数据库 seed 用的是 6 类「电音狂热者 / 深夜循环者 / 探索猎手 / 聚会歌者 /
 *   经典收藏家 / 均衡听众」（code EN/NT/EX/SO/CL/BL，维度 energy/social/curiosity/nostalgia）。
 *   两套分类**不通用**（连维度都不一样），所以这里对两套 code 都配了颜色，
 *   页面按"库里实际是什么就显示什么"来渲染 —— 不编造数据。
 */

/**
 * ⭐ 人格六型色系（2026-10-02 修正版 · 依据用户 12 张成品卡精确采样）
 * ------------------------------------------------------------
 * ⚠️ 2026-10-02 **修正**：第一版（09-30）的"色型对应"是我按气质**推断**的，用户把成品图发来后
 *   一对，**错了 3 个型**（音色控/旋律捕手/词句收藏家），安静聆听者也偏了。现在按图取真值：
 *   采样自 `clipboard-…/12 张成品卡`（长版 1086×1448 + 方版 1024×1024，逐张取背景主色/底部区/最饱和色）。
 *
 * | 型 | 卡片画面 | base | 强调色 accent |
 * |----|---------|------|--------------|
 * | CLM 安静聆听者 | 深蓝夜空 + 水面月亮（上暗下亮） | #114d94 | #4597d8 |
 * | TMB 音色控 | 薄荷青发光曲线（浅底深字） | #b5eae8 | #007577 |
 * | MEL 旋律捕手 | 夜紫蓝 + 音符（强调亮紫） | #111441 | #b29df4 |
 * | RHY 节拍动物 | 烈焰橙 + 跳跃小人（中段最亮） | #ef5f09 | #f9b633 |
 * | EXP 探索者 | 暗金棕 + 提灯小人 | #7b3f04 | #e0a63c |
 * | LYR 词句收藏家 | 暖金旧纸（浅底深褐字） | #f1d398 | #c98a2e |
 *
 * 字段：
 *   base   背景主色（旧 `typeColor()` 继续返回它，页面零破坏）
 *   light  背景亮端（渐变亮部 / 底部光）
 *   deep   背景暗端
 *   ink    该底色上的**文字色**（浅底配深字、深底配浅字，保证对比度）
 *   accent 强调色（进度条填充 / 高亮数字，卡片上最饱和的那一档）
 *   glow   光向：top 上亮下暗｜center 中间最亮｜bottom 越往下越亮
 */
export const TYPE_PALETTE = {
  CLM: { name: '深海蓝', base: '#114d94', light: '#4597d8', deep: '#022963', ink: '#eaf4ff', accent: '#4597d8', glow: 'bottom' },
  TMB: { name: '薄荷青', base: '#b5eae8', light: '#d3f1ee', deep: '#7fbcb0', ink: '#0d4f4a', accent: '#007577', glow: 'top' },
  MEL: { name: '夜紫蓝', base: '#111441', light: '#282763', deep: '#090c29', ink: '#e8e6ff', accent: '#b29df4', glow: 'top' },
  RHY: { name: '烈焰橙', base: '#ef5f09', light: '#f67d10', deep: '#e64906', ink: '#fff6ec', accent: '#f9b633', glow: 'center' },
  EXP: { name: '暗金棕', base: '#7b3f04', light: '#b36105', deep: '#4b2301', ink: '#ffe9c2', accent: '#e0a63c', glow: 'center' },
  LYR: { name: '暖金纸', base: '#f1d398', light: '#ffeebb', deep: '#d89e42', ink: '#5a3a06', accent: '#c98a2e', glow: 'top' },
};

/**
 * 取某型的色系（未知 code 用稳定映射兜底，保证不空白也不闪色）
 */
export function typePalette(code) {
  const key = String(code || '').toUpperCase();
  if (TYPE_PALETTE[key]) return TYPE_PALETTE[key];
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return {
    name: '自定义',
    base: `hsl(${h} 78% 46%)`,
    light: `hsl(${h} 70% 66%)`,
    deep: `hsl(${h} 85% 20%)`,
    ink: '#ffffff',
    accent: `hsl(${h} 84% 60%)`,
    glow: 'top',
  };
}

/**
 * ⭐ 品牌色（2026-10-05 新增）—— 「卡片色系」与「品牌色」是两件事，别混用
 * ------------------------------------------------------------
 * 上面 `TYPE_PALETTE` 的 base/light/deep 是**卡片背景色**（深底配浅字）。把它们当**文字色**
 * 用在浅色玻璃卡上就出事 —— 用户 2026-10-05 在「音乐人格图鉴」上看到"旋律捕手是黑的"，
 * 根因就是这个。实测（`tools/pw/compute-brand-colors.mjs`，白底 WCAG 对比度）：
 *
 * | 型 | 旧值（base 当文字色） | 白底对比 | 结论 |
 * |----|----------------------|---------|------|
 * | MEL | #111441 | 17.5 | 亮度挤到近乎全黑 —— **就是用户看到的"黑"** |
 * | TMB | #b5eae8 | 1.32 | 淡薄荷，白底上几乎看不见 |
 * | LYR | #f1d398 | 1.45 | 淡金，同上 |
 * | RHY | #ef5f09 | 3.33 | 低于正文 AA 的 4.5 |
 * | CLM | #114d94 | 8.36 | 达标，但暗到发黑、不像"深海蓝" |
 * | EXP | #7b3f04 | 8.22 | 达标，但是深褐 |
 *
 * 改法：新增「品牌色」= **保持卡片色相与饱和度、只调明度**，压到白底 ≥ 4.5:1（正文 AA）；
 * 深色主题另给一档（暗底 ≥ 4.5:1）。真值**只写在 `tokens.css` 的 `--tc-<CODE>`**，
 * 这里只登记数值供查阅，`typeColor()` 返回 `var(--tc-XXX)` ⇒ 自动跟随主题、全站一处真值。
 *
 * ⚠️ 已知取舍：烈焰橙压到 4.5 会偏褐，且**探索者/词句收藏家两个暖金压后可读后色相很接近**
 *   （#9d6e19 / #9e6d24）。试过"压暗时顶饱和度保橙感"，结果三个暖色全部收敛成同一种褐
 *   （#a26b00 / #a56a00 / #ac6600），**辨识度反而更差**，故放弃。
 *   ⇒ 结论：**颜色不足以区分六型，页面必须同时给每型配自己的卡片缩略图**。
 */
export const TYPE_BRAND = {
  CLM: { light: '#2470ad', dark: '#4d9bda' }, // 深海蓝
  MEL: { light: '#625cd3', dark: '#908ce0' }, // 夜紫蓝（用户点名的蓝紫：保持原色不动，对比已 4.63）
  RHY: { light: '#936304', dark: '#f9b633' }, // 烈焰橙
  EXP: { light: '#8f6417', dark: '#e0a63c' }, // 暗金棕
  LYR: { light: '#916321', dark: '#c98a2e' }, // 暖金纸
  TMB: { light: '#007577', dark: '#00a6a9' }, // 薄荷青
};

/**
 * 取某型的**品牌色**（真实色值，不是 `var()`）—— 给需要解析色值/画布/算渐变的场合用。
 * 只想上色（CSS 内联样式）请用下面的 `typeColor()`，它会跟随主题。
 */
export function typeBrand(code) {
  const key = String(code || '').toUpperCase();
  if (TYPE_BRAND[key]) return TYPE_BRAND[key].light;
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h} 62% 40%)`;
}

/** `#rrggbb` → `rgba(r,g,b,a)`；非 hex（如 `hsl(...)`、`var(...)`）返回 null，调用方自行兜底 */
export function withAlpha(color, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(color || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** code → 主色（从色系派生，**不再手写第二份**，避免两处不一致）
 *  ⚠️ 这是**卡片背景色**，只适合做底/渐变/大色块，**不要拿它当文字色**（见上面 TYPE_BRAND）。 */
export const TYPE_COLOR = Object.fromEntries(
  Object.entries(TYPE_PALETTE).map(([k, v]) => [k, v.base]),
);
/** 历史遗留的另 6 个 code（库里已不用，保留兜底防止空白）：按气质映射到同样的色系 */
Object.assign(TYPE_COLOR, {
  EN: TYPE_PALETTE.RHY.base,
  NT: TYPE_PALETTE.CLM.base,
  EX: TYPE_PALETTE.EXP.base,
  SO: TYPE_PALETTE.MEL.base,
  CL: TYPE_PALETTE.LYR.base,
  BL: TYPE_PALETTE.TMB.base,
});

/** 维度 key → 中文名（两套维度都覆盖） */
export const DIM_CN = {
  // 库里在用
  energy: '节奏能量',
  social: '社交分享',
  curiosity: '探索欲',
  nostalgia: '怀旧倾向',
  // 设计稿里出现的
  melody: '旋律敏感',
  rhythm: '节奏偏好',
  arrangement: '编曲层次',
  calm: '安静倾向',
};

/** 主题色：已知 code 用固定品牌色（跟随主题的 CSS 变量），未知 code 用 code 稳定映射一个色相
 *  ⭐ 2026-10-05 修正：原来返回 `TYPE_COLOR[key]`（＝卡片**背景**色）→ MEL 白底上是近乎全黑、
 *     TMB/LYR 几乎看不见（详见 `TYPE_BRAND` 注释里的实测表）。现在返回 `var(--tc-XXX)`。 */
export function typeColor(code) {
  const key = String(code || '').toUpperCase();
  if (TYPE_BRAND[key]) return `var(--tc-${key})`;
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h} 62% 40%)`;
}

/** 品牌色的** rgb 三元组变量**（同样跟随主题）：给 `rgba(var(--tc-XXX-rgb), .3)` 这
 *  类需要半透明的场合用。真值仍然只写在 tokens.css，这里只是把变量名拼出来。 */
export function typeColorRgb(code) {
  const key = String(code || '').toUpperCase();
  if (TYPE_BRAND[key]) return `var(--tc-${key}-rgb)`;
  return '14 165 233';
}

/** 品牌色的**半透明版**（同样跟随主题）：给标签底色 / 渐变暗端用。
 *  ⚠️ 别再有人拿 `typeColor()` 的返回值去拼 rgba —— 现在它返回的是 `var(--tc-XXX)`，
 *     字符串切割必然失败（会静默掉成兜底蓝）。要透明度就用这个函数。
 *  ⚠️ 2026-10-05 踩过的坑：返回 `rgba(var(--x-rgb), .3)` 是**非法值**
 *     （空格通道 + 逗号 alpha 不成立）→ 整条声明被丢掉、半透明底色静默消失。
 *     必须用斜杠语法 `rgb(var(--x-rgb) / .3)`。 */
export function typeColorAlpha(code, alpha = 0.3) {
  const key = String(code || '').toUpperCase();
  if (TYPE_BRAND[key]) return `rgb(var(--tc-${key}-rgb) / ${alpha})`;
  return `rgba(14, 165, 233, ${alpha})`;
}

/** 维度中文名：未知 key 原样返回 */
export function dimLabel(key) {
  return DIM_CN[key] || key;
}

/** 把 scores（数组或对象，0-1 或 0-10）统一成 [{key,label,ratio,text}] */
export function normalizeScores(scores) {
  const raw = Array.isArray(scores)
    ? scores.map((x) => [x.key ?? x.dim ?? x.label, x.score ?? x.value])
    : Object.entries(scores || {});
  return raw
    .filter(([k, v]) => k != null && v != null)
    .map(([k, v]) => {
      const n = Number(v) || 0;
      // 兼容 0-1（seed 里 dims 用的）与 0-10 两种量纲
      const ten = n <= 1 ? Math.round(n * 10) : Math.round(n);
      return { key: k, label: dimLabel(k), ten, ratio: Math.max(3, Math.min(100, ten * 10)) };
    });
}

/**
 * 传播 / 分享层数据（2026-09-22，D3-C，用户选 C：只加传播层、不扩型）
 * ------------------------------------------------------------
 * 纯前端静态数据，零后端改动；与 data/personality.js 的 AUDIO_WHITELIST 人工挑片口径一致。
 * 用于结果卡上「听歌人设标签」与「同型代表作」。
 */
export const PERSONA_TAGS = {
  MEL: ['副歌中毒', '旋律雷达', '哼唱体质', '抓耳优先'],
  RHY: ['身体先动', '律动雷达', '节拍控', '蹦迪灵魂'],
  LYR: ['词党', '摘抄选手', '故事胃', '一句封神'],
  TMB: ['音色党', '制作控', '细节耳', '声场洁癖'],
  CLM: ['独处耳机', '氛围胃', '安静体质', '深夜模式'],
  EXP: ['猎奇耳', '新歌雷达', '口味常换', '冷门猎人'],
};

/**
 * 同型代表作（D3-C 传播层 · 人工挑片，与该型气质一致；仅供"找同类"参考，不参与计分）
 * ⚠️ 2026-09-23 第十二批：补上 **真实封面 artworkUrl**（原来在结果页只画专辑名首字占位，
 *    用户："要真封面"）。URL 解析口径：
 *      ① 本地曲库优先（与全站同口径，如 范特西 / Abbey Road / Thriller / 21 / 寓言…）；
 *      ② 库里没有的走 iTunes（**强制歌手匹配**，排除 Live / EP / Tribute），取 600×600；
 *      ③ 遇見 / 後來 本身是"歌不是专辑" → 用其所属专辑的封面。
 *    渲染端（PersonalityResultView）在 artworkUrl 缺失时回退为原来的首字占位，不会白板。
 */
export const TYPE_REPRESENTATIVES = {
  MEL: [
    { artist: '周杰伦', album: '范特西', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/14/b9/fa/14b9fa3f-ef0c-01de-3721-93ff740062b5/23UM1IM56711.rgb.jpg/600x600bb.jpg' },
    { artist: 'The Beatles', album: 'Abbey Road', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/48/53/43/485343e3-dd6a-0034-faec-f4b6403f8108/13UMGIM63890.rgb.jpg/600x600bb.jpg' },
    { artist: '孫燕姿', album: '遇見', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/8a/91/d7/8a91d731-cdb1-01b5-17a9-c88cf66d6e01/5050466855725.jpg/600x600bb.jpg' },
    { artist: 'Adele', album: '21', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/f8/df/0a/f8df0ac9-ae76-9dae-86d3-4e913fc54fb1/634904152062.png/600x600bb.jpg' },
  ],
  RHY: [
    { artist: 'Michael Jackson', album: 'Thriller', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/32/4f/fd/324ffda2-9e51-8f6a-0c2d-c6fd2b41ac55/074643811224.jpg/600x600bb.jpg' },
    { artist: 'Bruno Mars', album: '24K Magic', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/600x600bb.jpg' },
    { artist: 'Dua Lipa', album: 'Future Nostalgia', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/6c/11/d6/6c11d681-aa3a-d59e-4c2e-f77e181026ab/190295092665.jpg/600x600bb.jpg' },
    { artist: '周杰伦', album: '范特西', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/14/b9/fa/14b9fa3f-ef0c-01de-3721-93ff740062b5/23UM1IM56711.rgb.jpg/600x600bb.jpg' },
  ],
  LYR: [
    { artist: '李健', album: '似水流年', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/60/a0/ce/60a0cee1-51e1-a8d3-e37a-0c4363f7550d/dj.gjyxmysu.jpg/600x600bb.jpg' },
    { artist: '羅大佑', album: '之乎者也', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/72/e7/c7/72e7c712-7417-e73a-d802-6569af1489df/cover.jpg/600x600bb.jpg' },
    { artist: '陳綺貞', album: '華麗的冒險', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/c5/c5/b9/c5c5b9a5-7b08-1579-950e-6ad69d8f105a/2005_9-_1400.jpg/600x600bb.jpg' },
    { artist: '劉若英', album: '後來', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/35/fd/2e/35fd2ef0-83c1-58dc-924b-553f04fb0104/dj.cozpisse.jpg/600x600bb.jpg' },
  ],
  TMB: [
    { artist: 'Radiohead', album: 'OK Computer', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/07/60/ba/0760ba0f-148c-b18f-d0ff-169ee96f3af5/634904078164.png/600x600bb.jpg' },
    { artist: 'Björk', album: 'Homogenic', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/7f/bd/d0/7fbdd0e0-c588-ef4b-a6dd-4dca21f8b41f/081227607364.jpg/600x600bb.jpg' },
    { artist: 'Tame Impala', album: 'Currents', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a8/2e/b4/a82eb490-f30a-a321-461a-0383c88fec95/15UMGIM23316.rgb.jpg/600x600bb.jpg' },
    { artist: '王力宏', album: '蓋世英雄', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/f9/82/88/f98288eb-ea32-6c8c-7919-357c31a4b437/1400X1400.jpg/600x600bb.jpg' },
  ],
  CLM: [
    { artist: '王菲', album: '寓言', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music1/v4/eb/1a/6c/eb1a6ce1-646b-b2a6-bc2e-be629e981b74/Untitled.png/600x600bb.jpg' },
    { artist: 'Joni Mitchell', album: 'Blue', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/00/a2/43/00a24363-cf69-bfd2-a26a-a042d57ab141/075992719926.jpg/600x600bb.jpg' },
    { artist: 'Max Richter', album: 'Sleep', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/d6/1f/4a/d61f4a9a-1b9f-b0ff-b857-23d8ddf9a592/15UMGIM26134.rgb.jpg/600x600bb.jpg' },
    { artist: 'Ludovico Einaudi', album: 'Divenire', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/2c/86/bc/2c86bcb8-2ff2-f0a1-f157-976f5c85159a/06UMGIM37884.rgb.jpg/600x600bb.jpg' },
  ],
  EXP: [
    { artist: 'Daft Punk', album: 'Discovery', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/fd/4a/77/fd4a77db-0ebc-d043-41a2-f32fa1bb0fb4/dj.qrikkdwj.jpg/600x600bb.jpg' },
    { artist: 'Arctic Monkeys', album: 'AM', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/69/9c/b5/699cb5d6-115c-ff73-9d26-e57ea4350d72/887828031795.png/600x600bb.jpg' },
    { artist: 'Kendrick Lamar', album: 'good kid, m.A.A.d city', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/ba/c3/c5/bac3c531-dc7e-d0da-d785-fe9f17219950/12UMGIM52990.rgb.jpg/600x600bb.jpg' },
    { artist: 'Tame Impala', album: 'Currents', artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a8/2e/b4/a82eb490-f30a-a321-461a-0383c88fec95/15UMGIM23316.rgb.jpg/600x600bb.jpg' },
  ],
};
