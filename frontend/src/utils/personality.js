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
 * ⭐ 人格六型色系（2026-09-30 革新 · 依据用户自制 12 张卡片量化得出）
 * ------------------------------------------------------------
 * 来源：`E:\桌面\音乐人格\音乐人格卡片.zip`（长版 6 张）+ `E:\下载\音乐人格方形卡.zip`（方版 6 张），
 *   逐张采样得出：**每个型一个色系，长版/方版一一对应，稳定**。
 * ⭐ 最关键的一条：这 6 个色系**明暗分三层**（浅 / 中 / 暗），不是六个平铺色 ——
 *   旧色板 6 色全在同一明度档（L≈45–55%）所以观感"平均没重点"，这是本次革新要治的根。
 *   浅：薄荷青 L80 / 暖金 L77　中：烈焰橙 L47 / 宝蓝 L34　暗：深靛蓝 L9 / 深棕橙 L22
 * 字段：
 *   base  主色（旧 `typeColor()` 继续返回它，页面零破坏）
 *   light 浅端（渐变亮部 / 高光）
 *   deep  深端（渐变暗部 / 压暗）
 *   ink   该底色上的**文字色**（浅底配深字、深底配浅字，保证对比度）
 *   glow  光向（top 上亮下暗｜center 中间亮｜bottom 下亮）—— 按型不同，见分析：
 *         深色卡是"上亮→下暗"，橙/金卡是"中间最亮→两端稍暗"，宝蓝是"越往下越亮"
 * ⚠️ 色型对应目前是**按气质推断**的（我读不到卡上的字），用户校对后改这里一行即可。
 */
export const TYPE_PALETTE = {
  RHY: { name: '烈焰橙', base: '#e95207', light: '#f9b633', deep: '#de3f05', ink: '#fff8f0', glow: 'center' },
  MEL: { name: '暖金', base: '#f1d498', light: '#f6e2b8', deep: '#e1ae54', ink: '#3a2408', glow: 'center' },
  CLM: { name: '深靛蓝', base: '#080b24', light: '#1c1f51', deep: '#060a22', ink: '#eaf2ff', glow: 'top' },
  EXP: { name: '薄荷青', base: '#b3e8e4', light: '#d7f2ef', deep: '#8dd4d6', ink: '#0d3b39', glow: 'top' },
  TMB: { name: '宝蓝', base: '#11529a', light: '#287fcb', deep: '#022b66', ink: '#ffffff', glow: 'bottom' },
  LYR: { name: '深棕橙', base: '#6d3602', light: '#9a5204', deep: '#542801', ink: '#f6e2b8', glow: 'center' },
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
    glow: 'top',
  };
}

/** code → 主色（从色系派生，**不再手写第二份**，避免两处不一致） */
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

/** 主题色：已知 code 用固定色，未知 code 用 code 稳定映射一个色相 */
export function typeColor(code) {
  const key = String(code || '').toUpperCase();
  if (TYPE_COLOR[key]) return TYPE_COLOR[key];
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h} 62% 52%)`;
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
