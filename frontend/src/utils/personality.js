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

/** code → 主题色（两套 code 都覆盖，保证任何一套都能正常上色） */
export const TYPE_COLOR = {
  // 设计稿那 6 类
  MEL: '#E0554F',
  RHY: '#E8873A',
  LYR: '#C9A227',
  TMB: '#3F8F7A',
  CLM: '#5B7FA8',
  EXP: '#8A6BC1',
  // 当前库里的 6 类
  EN: '#E8873A',
  NT: '#5B7FA8',
  EX: '#8A6BC1',
  SO: '#E0554F',
  CL: '#C9A227',
  BL: '#3F8F7A',
};

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

export const TYPE_REPRESENTATIVES = {
  MEL: [
    { artist: '周杰伦', album: '范特西' },
    { artist: 'The Beatles', album: 'Abbey Road' },
    { artist: '孫燕姿', album: '遇見' },
    { artist: 'Adele', album: '21' },
  ],
  RHY: [
    { artist: 'Michael Jackson', album: 'Thriller' },
    { artist: 'Bruno Mars', album: '24K Magic' },
    { artist: 'Dua Lipa', album: 'Future Nostalgia' },
    { artist: '周杰伦', album: '范特西' },
  ],
  LYR: [
    { artist: '李健', album: '似水流年' },
    { artist: '羅大佑', album: '之乎者也' },
    { artist: '陳綺貞', album: '華麗的冒險' },
    { artist: '劉若英', album: '後來' },
  ],
  TMB: [
    { artist: 'Radiohead', album: 'OK Computer' },
    { artist: 'Björk', album: 'Homogenic' },
    { artist: 'Tame Impala', album: 'Currents' },
    { artist: '王力宏', album: '蓋世英雄' },
  ],
  CLM: [
    { artist: '王菲', album: '寓言' },
    { artist: 'Joni Mitchell', album: 'Blue' },
    { artist: 'Max Richter', album: 'Sleep' },
    { artist: 'Ludovico Einaudi', album: 'Divenire' },
  ],
  EXP: [
    { artist: 'Daft Punk', album: 'Discovery' },
    { artist: 'Arctic Monkeys', album: 'AM' },
    { artist: 'Kendrick Lamar', album: 'good kid, m.A.A.d city' },
    { artist: 'Tame Impala', album: 'Currents' },
  ],
};
