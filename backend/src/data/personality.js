/**
 * 音乐人格 · 题目与类型（唯一数据源）
 * ------------------------------------------------------------
 * ⚠️ 赛制/内容口径：**以设计稿 docs/design/音格-UI设计稿.html 为准**。
 *   6 个类型 = 旋律捕手 / 节拍动物 / 词句收藏家 / 音色控 / 安静聆听者 / 探索者
 *   4 个维度 = 旋律敏感 melody / 节奏偏好 rhythm / 编曲层次 arrangement / 安静倾向 calm
 *
 * 历史坑（2026-09-17）：早先版本用的是另一套（电音狂热者…EN/NT/EX/SO/CL/BL，
 * 维度 energy/social/curiosity/nostalgia），与设计稿完全不通，已废弃。
 * 现在 seed.js 与迁移脚本都从这里取，避免两份口径打架。
 */

/** 已废弃的旧人格 code（2026-09-17 之前那套）——seed/迁移时必须清掉，否则库里会同时存在两套 */
export const DEPRECATED_TYPE_CODES = ['EN', 'NT', 'EX', 'SO', 'CL', 'BL'];

/** 四个维度（与设计稿人格卡的 4 根维度条一致） */
export const DIMS = ['melody', 'rhythm', 'arrangement', 'calm'];

export const DIM_LABELS = {
  melody: '旋律敏感',
  rhythm: '节奏偏好',
  arrangement: '编曲层次',
  calm: '安静倾向',
};

/** 12 道题（含 2 道听感题）。score 的 key 必须是 DIMS 里的维度 */
export const QUESTIONS = [
  {
    order: 1,
    type: 'choice',
    title: '周末想听歌时，你更可能怎么做？',
    dims: ['rhythm', 'calm'],
    options: [
      { key: 'A', label: '把音箱开到最大，边做家务边放', score: { rhythm: 3 } },
      { key: 'B', label: '戴上耳机一个人慢慢听', score: { calm: 3 } },
      { key: 'C', label: '拉上朋友一起听，聊谁唱得好', score: { melody: 2, rhythm: 1 } },
      { key: 'D', label: '随便点开推荐，听没听过的', score: { arrangement: 3 } },
    ],
  },
  {
    order: 2,
    type: 'choice',
    title: '听到一首特别喜欢的歌，你的第一反应是？',
    dims: ['melody', 'arrangement'],
    options: [
      { key: 'A', label: '立刻分享给别人', score: { melody: 3 } },
      { key: 'B', label: '点进歌手主页，把他的歌全听一遍', score: { arrangement: 3 } },
      { key: 'C', label: '单曲循环一整晚', score: { melody: 2, calm: 2 } },
      { key: 'D', label: '记下来，加进歌单里存着', score: { arrangement: 2, calm: 1 } },
    ],
  },
  {
    order: 3,
    type: 'choice',
    title: '你的歌单里，老歌大概占多少？',
    dims: ['calm', 'arrangement'],
    options: [
      { key: 'A', label: '大半都是老歌，越听越有味道', score: { calm: 3 } },
      { key: 'B', label: '一半一半', score: { calm: 1, arrangement: 1 } },
      { key: 'C', label: '大多是最近的新歌', score: { arrangement: 3 } },
      { key: 'D', label: '没固定，想到什么听什么', score: { arrangement: 2, rhythm: 1 } },
    ],
  },
  {
    order: 4,
    type: 'choice',
    title: '你会主动去找没听过的歌手吗？',
    dims: ['arrangement'],
    options: [
      { key: 'A', label: '经常，专门去翻榜单和推荐', score: { arrangement: 3 } },
      { key: 'B', label: '偶尔，看到有意思的会点开', score: { arrangement: 2 } },
      { key: 'C', label: '很少，还是听熟悉的那几个', score: { calm: 3 } },
      { key: 'D', label: '看心情', score: { arrangement: 1, calm: 1 } },
    ],
  },
  {
    order: 5,
    type: 'choice',
    title: '一首歌里，你最先注意到的是？',
    dims: ['melody', 'arrangement'],
    options: [
      { key: 'A', label: '编曲和制作细节', score: { arrangement: 3 } },
      { key: 'B', label: '歌词写了什么', score: { arrangement: 2, melody: 1 } },
      { key: 'C', label: '节奏和氛围', score: { rhythm: 3 } },
      { key: 'D', label: '歌手的声音本身', score: { melody: 3 } },
    ],
  },
  {
    order: 6,
    type: 'choice',
    title: '听歌的时候，你通常在做什么？',
    dims: ['rhythm', 'calm'],
    options: [
      { key: 'A', label: '跟着节奏动起来', score: { rhythm: 3 } },
      { key: 'B', label: '专心听，什么都不干', score: { calm: 3 } },
      { key: 'C', label: '当作聚会背景音', score: { melody: 2, rhythm: 1 } },
      { key: 'D', label: '一边听一边写点东西', score: { calm: 2, arrangement: 1 } },
    ],
  },
  {
    order: 7,
    type: 'choice',
    title: '去 KTV，你一般是？',
    dims: ['melody', 'rhythm'],
    options: [
      { key: 'A', label: '抢麦的那个', score: { melody: 3, rhythm: 1 } },
      { key: 'B', label: '等人点了才唱', score: { melody: 1, calm: 1 } },
      { key: 'C', label: '负责点歌和鼓掌', score: { melody: 2 } },
      { key: 'D', label: '专门唱别人没听过的', score: { arrangement: 3, rhythm: 1 } },
    ],
  },
  {
    order: 8,
    type: 'choice',
    title: '发现一个没什么人知道的宝藏歌手，你会？',
    dims: ['arrangement', 'melody'],
    options: [
      { key: 'A', label: '有一种挖到宝的满足感，继续深挖', score: { arrangement: 3 } },
      { key: 'B', label: '赶紧安利给身边的人', score: { melody: 3 } },
      { key: 'C', label: '默默收藏，不太声张', score: { calm: 3 } },
      { key: 'D', label: '关注一下，看后续作品', score: { arrangement: 2, calm: 1 } },
    ],
  },
  {
    order: 9,
    type: 'audio',
    title: '听这段旋律，你的第一感觉更像？',
    audioRef: null,
    dims: ['melody', 'rhythm'],
    options: [
      { key: 'A', label: '想立刻跳起来', score: { rhythm: 3 } },
      { key: 'B', label: '像回到了某个夏天', score: { calm: 3 } },
      { key: 'C', label: '很想知道这是谁的歌', score: { arrangement: 3 } },
      { key: 'D', label: '适合放进晚上的歌单', score: { calm: 2, melody: 1 } },
    ],
  },
  {
    order: 10,
    type: 'audio',
    title: '如果这段旋律是一段电影配乐，你希望画面是？',
    audioRef: null,
    dims: ['arrangement', 'calm'],
    options: [
      { key: 'A', label: '城市夜景里开车穿行', score: { arrangement: 2, rhythm: 2 } },
      { key: 'B', label: '旧照片一样的回忆镜头', score: { calm: 3 } },
      { key: 'C', label: '一群人在海边疯玩', score: { melody: 3, rhythm: 2 } },
      { key: 'D', label: '一个人在房间发呆', score: { calm: 2, melody: 1 } },
    ],
  },
  {
    order: 11,
    type: 'choice',
    title: '去看一场演唱会，你最期待的是？',
    dims: ['melody', 'rhythm'],
    options: [
      { key: 'A', label: '全场大合唱的那一瞬间', score: { melody: 3, rhythm: 1 } },
      { key: 'B', label: '听到那首对你有特殊意义的歌', score: { calm: 3 } },
      { key: 'C', label: '现场编曲和录音室不一样的地方', score: { arrangement: 3 } },
      { key: 'D', label: '跟着一起跳、一起喊', score: { rhythm: 3 } },
    ],
  },
  {
    order: 12,
    type: 'choice',
    title: '十年后再回头看今天在听的歌，你觉得？',
    dims: ['calm', 'arrangement'],
    options: [
      { key: 'A', label: '一定会觉得很怀念', score: { calm: 3 } },
      { key: 'B', label: '大概早就听腻了', score: { arrangement: 2, rhythm: 1 } },
      { key: 'C', label: '希望那时候还在听同一批人', score: { calm: 2, melody: 1 } },
      { key: 'D', label: '无所谓，好歌不分年代', score: { melody: 2, arrangement: 1 } },
    ],
  },
];

/** 6 个人格类型（名字/描述与设计稿 p12 一致；dims 为 0-1 的特征值） */
export const TYPES = [
  {
    code: 'MEL',
    name: '旋律捕手',
    description: '先记住旋律，再听其他。副歌能不能立住，决定了一切。',
    dims: { melody: 1, rhythm: 0.35, arrangement: 0.45, calm: 0.4 },
  },
  {
    code: 'RHY',
    name: '节拍动物',
    description: '身体先有反应，脑子后到。鼓点一进来就想动。',
    dims: { melody: 0.45, rhythm: 1, arrangement: 0.3, calm: 0.15 },
  },
  {
    code: 'LYR',
    name: '词句收藏家',
    description: '歌词是一首歌的灵魂，会为了一句词反复听同一段。',
    dims: { melody: 0.7, rhythm: 0.25, arrangement: 0.85, calm: 0.5 },
  },
  {
    code: 'TMB',
    name: '音色控',
    description: '在意声音本身的质感，合成器、人声处理都能听出来。',
    dims: { melody: 0.6, rhythm: 0.35, arrangement: 1, calm: 0.35 },
  },
  {
    code: 'CLM',
    name: '安静聆听者',
    description: '要的是氛围，不是信息量。适合一个人戴耳机听。',
    dims: { melody: 0.5, rhythm: 0.1, arrangement: 0.4, calm: 1 },
  },
  {
    code: 'EXP',
    name: '探索者',
    description: '越没听过越有兴趣，重复的歌单会让你难受。',
    dims: { melody: 0.55, rhythm: 0.5, arrangement: 0.9, calm: 0.2 },
  },
];

export default { DIMS, DIM_LABELS, QUESTIONS, TYPES, DEPRECATED_TYPE_CODES };
