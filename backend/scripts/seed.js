/**
 * 初始化数据脚本
 * ------------------------------------------------------------
 * 幂等：可反复执行。灌入 12 道测评题、6 个人格类型与 1 个管理员账号。
 * 题目与类型定义在 `src/data/personality.js`（**唯一数据源**，口径以设计稿为准）。
 * 用法：npm run seed
 * 管理员账号可通过环境变量覆盖：ADMIN_ACCOUNT / ADMIN_PASSWORD / ADMIN_NICKNAME
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { User, PersonalityQuestion, PersonalityType } from '../src/models/index.js';
import { logger } from '../src/shared/logger.js';
import { QUESTIONS, TYPES, DEPRECATED_TYPE_CODES } from '../src/data/personality.js';

async function seed() {
  await connectDb();

  // 0) 清掉已废弃的旧人格类型（否则库里会同时存在两套共 12 个类型）
  const removed = await PersonalityType.deleteMany({ code: { $in: DEPRECATED_TYPE_CODES } });
  if (removed.deletedCount) logger.info('已清掉废弃人格类型', { count: removed.deletedCount, codes: DEPRECATED_TYPE_CODES });

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
