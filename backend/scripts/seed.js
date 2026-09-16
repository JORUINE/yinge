/**
 * 初始化数据脚本
 * ------------------------------------------------------------
 * 幂等：可反复执行。灌入 12 道测评题、6 个人格类型与 1 个管理员账号。
 * 用法：npm run seed
 * 管理员账号可通过环境变量覆盖：ADMIN_ACCOUNT / ADMIN_PASSWORD / ADMIN_NICKNAME
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { User, PersonalityQuestion, PersonalityType } from '../src/models/index.js';
import { logger } from '../src/shared/logger.js';

/** 四个维度：能量 energy / 社交 social / 探索 curiosity / 怀旧 nostalgia */
const QUESTIONS = [
  {
    order: 1,
    type: 'choice',
    title: '周末想听歌时，你更可能怎么做？',
    dims: ['energy', 'social'],
    options: [
      { key: 'A', label: '把音箱开到最大，边做家务边放', score: { energy: 3, social: 1 } },
      { key: 'B', label: '戴上耳机一个人慢慢听', score: { nostalgia: 2, energy: 1 } },
      { key: 'C', label: '拉上朋友一起听，聊谁唱得好', score: { social: 3, energy: 1 } },
      { key: 'D', label: '随便点开推荐，听没听过的', score: { curiosity: 3 } },
    ],
  },
  {
    order: 2,
    type: 'choice',
    title: '听到一首特别喜欢的歌，你的第一反应是？',
    dims: ['social', 'curiosity'],
    options: [
      { key: 'A', label: '立刻分享给别人', score: { social: 3 } },
      { key: 'B', label: '点进歌手主页，把他的歌全听一遍', score: { curiosity: 3 } },
      { key: 'C', label: '单曲循环一整晚', score: { nostalgia: 2, energy: 1 } },
      { key: 'D', label: '记下来，加进歌单里存着', score: { nostalgia: 2, curiosity: 1 } },
    ],
  },
  {
    order: 3,
    type: 'choice',
    title: '你的歌单里，老歌大概占多少？',
    dims: ['nostalgia', 'curiosity'],
    options: [
      { key: 'A', label: '大半都是老歌，越听越有味道', score: { nostalgia: 3 } },
      { key: 'B', label: '一半一半', score: { nostalgia: 1, curiosity: 1 } },
      { key: 'C', label: '大多是最近的新歌', score: { curiosity: 3 } },
      { key: 'D', label: '没固定，想到什么听什么', score: { curiosity: 2, energy: 1 } },
    ],
  },
  {
    order: 4,
    type: 'choice',
    title: '你会主动去找没听过的歌手吗？',
    dims: ['curiosity'],
    options: [
      { key: 'A', label: '经常，专门去翻榜单和推荐', score: { curiosity: 3 } },
      { key: 'B', label: '偶尔，看到有意思的会点开', score: { curiosity: 2 } },
      { key: 'C', label: '很少，还是听熟悉的那几个', score: { nostalgia: 3 } },
      { key: 'D', label: '看心情', score: { curiosity: 1, nostalgia: 1 } },
    ],
  },
  {
    order: 5,
    type: 'choice',
    title: '一首歌里，你最先注意到的是？',
    dims: ['curiosity', 'nostalgia'],
    options: [
      { key: 'A', label: '编曲和制作细节', score: { curiosity: 3 } },
      { key: 'B', label: '歌词写了什么', score: { nostalgia: 3 } },
      { key: 'C', label: '节奏和氛围', score: { energy: 3 } },
      { key: 'D', label: '歌手的声音本身', score: { social: 1, nostalgia: 1 } },
    ],
  },
  {
    order: 6,
    type: 'choice',
    title: '听歌的时候，你通常在做什么？',
    dims: ['energy', 'social'],
    options: [
      { key: 'A', label: '跟着节奏动起来', score: { energy: 3 } },
      { key: 'B', label: '专心听，什么都不干', score: { nostalgia: 3 } },
      { key: 'C', label: '当作聚会背景音', score: { social: 3 } },
      { key: 'D', label: '一边听一边写点东西', score: { curiosity: 2, nostalgia: 1 } },
    ],
  },
  {
    order: 7,
    type: 'choice',
    title: '去 KTV，你一般是？',
    dims: ['social', 'energy'],
    options: [
      { key: 'A', label: '抢麦的那个', score: { social: 3, energy: 2 } },
      { key: 'B', label: '等人点了才唱', score: { social: 1, nostalgia: 1 } },
      { key: 'C', label: '负责点歌和鼓掌', score: { social: 2 } },
      { key: 'D', label: '专门唱别人没听过的', score: { curiosity: 3, energy: 1 } },
    ],
  },
  {
    order: 8,
    type: 'choice',
    title: '发现一个没什么人知道的宝藏歌手，你会？',
    dims: ['curiosity', 'social'],
    options: [
      { key: 'A', label: '有一种挖到宝的满足感，继续深挖', score: { curiosity: 3 } },
      { key: 'B', label: '赶紧安利给身边的人', score: { social: 3 } },
      { key: 'C', label: '默默收藏，不太声张', score: { nostalgia: 3 } },
      { key: 'D', label: '关注一下，看后续作品', score: { curiosity: 2, social: 1 } },
    ],
  },
  {
    order: 9,
    type: 'audio',
    title: '听这段旋律，你的第一感觉更像？',
    audioRef: null,
    dims: ['energy', 'nostalgia'],
    options: [
      { key: 'A', label: '想立刻跳起来', score: { energy: 3 } },
      { key: 'B', label: '像回到了某个夏天', score: { nostalgia: 3 } },
      { key: 'C', label: '很想知道这是谁的歌', score: { curiosity: 3 } },
      { key: 'D', label: '适合放进晚上的歌单', score: { nostalgia: 2, social: 1 } },
    ],
  },
  {
    order: 10,
    type: 'audio',
    title: '如果这段旋律是一段电影配乐，你希望画面是？',
    audioRef: null,
    dims: ['curiosity', 'nostalgia'],
    options: [
      { key: 'A', label: '城市夜景里开车穿行', score: { curiosity: 2, energy: 2 } },
      { key: 'B', label: '旧照片一样的回忆镜头', score: { nostalgia: 3 } },
      { key: 'C', label: '一群人在海边疯玩', score: { social: 3, energy: 2 } },
      { key: 'D', label: '一个人在房间发呆', score: { nostalgia: 2, curiosity: 1 } },
    ],
  },
  {
    order: 11,
    type: 'choice',
    title: '去看一场演唱会，你最期待的是？',
    dims: ['energy', 'social'],
    options: [
      { key: 'A', label: '全场大合唱的那一瞬间', score: { social: 3, energy: 2 } },
      { key: 'B', label: '听到那首对你有特殊意义的歌', score: { nostalgia: 3 } },
      { key: 'C', label: '现场编曲和录音室不一样的地方', score: { curiosity: 3 } },
      { key: 'D', label: '跟着一起跳、一起喊', score: { energy: 3 } },
    ],
  },
  {
    order: 12,
    type: 'choice',
    title: '十年后再回头看今天在听的歌，你觉得？',
    dims: ['nostalgia', 'curiosity'],
    options: [
      { key: 'A', label: '一定会觉得很怀念', score: { nostalgia: 3 } },
      { key: 'B', label: '大概早就听腻了', score: { curiosity: 2, energy: 1 } },
      { key: 'C', label: '希望那时候还在听同一批人', score: { nostalgia: 2, social: 1 } },
      { key: 'D', label: '无所谓，好歌不分年代', score: { curiosity: 2, nostalgia: 1 } },
    ],
  },
];

const TYPES = [
  {
    code: 'EN',
    name: '电音狂热者',
    description: '你听歌就是为了那口劲儿，节奏一起你就坐不住，是朋友眼里天然的气氛担当。',
    dims: { energy: 1, social: 0.8, curiosity: 0.4, nostalgia: 0.2 },
  },
  {
    code: 'NT',
    name: '深夜循环者',
    description: '你习惯一个人戴着耳机，把同一首歌听很多遍，音乐对你来说更像一种私人空间。',
    dims: { energy: 0.2, social: 0.3, curiosity: 0.4, nostalgia: 1 },
  },
  {
    code: 'EX',
    name: '探索猎手',
    description: '你永远在找下一首没听过的歌，曲风跨度大，挖到宝藏歌手比听熟歌更让你兴奋。',
    dims: { energy: 0.5, social: 0.4, curiosity: 1, nostalgia: 0.2 },
  },
  {
    code: 'SO',
    name: '聚会歌者',
    description: '你的歌单是为别人准备的，一开口就能带动全场，音乐是你和别人建立连接的方式。',
    dims: { energy: 0.8, social: 1, curiosity: 0.3, nostalgia: 0.3 },
  },
  {
    code: 'CL',
    name: '经典收藏家',
    description: '你偏爱经得起时间的东西，一张专辑能听很多年，对你来说音乐是有重量的。',
    dims: { energy: 0.3, social: 0.3, curiosity: 0.5, nostalgia: 0.9 },
  },
  {
    code: 'BL',
    name: '均衡听众',
    description: '新歌老歌你都听，热闹安静你都行，你的听歌口味像一张撒得很开的网。',
    dims: { energy: 0.5, social: 0.5, curiosity: 0.5, nostalgia: 0.5 },
  },
];

async function seed() {
  await connectDb();

  // 1) 题目
  for (const q of QUESTIONS) {
    await PersonalityQuestion.updateOne({ order: q.order }, { $set: q }, { upsert: true });
  }
  logger.info('题目已写入', { count: QUESTIONS.length });

  // 2) 人格类型
  for (const t of TYPES) {
    await PersonalityType.updateOne({ code: t.code }, { $set: t }, { upsert: true });
  }
  logger.info('人格类型已写入', { count: TYPES.length });

  // 3) 管理员账号
  const account = (process.env.ADMIN_ACCOUNT || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin123456';
  const nickname = process.env.ADMIN_NICKNAME || '管理员';
  let admin = await User.findOne({ account });
  if (!admin) {
    admin = new User({ account, nickname, role: 'admin', status: 'active' });
    await admin.setPassword(password);
    await admin.save();
    logger.info('管理员账号已创建', { account });
  } else {
    logger.info('管理员账号已存在，跳过', { account });
  }

  await disconnectDb();
  logger.info('初始化完成');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('初始化失败', { error: err.message, stack: err.stack });
    process.exit(1);
  });
