/**
 * 服务入口
 * ------------------------------------------------------------
 * 先监听端口让服务起来，再异步连数据库（连接失败不退出，
 * 由 /ready 反映状态，避免云端把"数据库慢"误判成"服务挂了"）。
 * 收到 SIGTERM/SIGINT 时优雅关闭：停止接收新连接 → 关库 → 退出。
 */
import createApp from './app.js';
import config from './config/index.js';
import { connectDb, disconnectDb } from './db/connect.js';
import { logger } from './shared/logger.js';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info('服务已启动', { port: config.port, env: config.env, pid: process.pid });
});

connectDb()
  .then(() => logger.info('数据库连接完成'))
  .catch((err) => {
    logger.error('数据库初始连接失败，服务仍将启动（/ready 会反映状态）', { error: err.message });
  });

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('收到退出信号，开始优雅关闭', { signal });

  server.close(async () => {
    try {
      await disconnectDb();
      logger.info('资源已释放，进程退出');
      process.exit(0);
    } catch (err) {
      logger.error('关闭过程中出错', { error: err.message });
      process.exit(1);
    }
  });

  // 兜底：10 秒内未关闭完成则强制退出
  setTimeout(() => {
    logger.warn('优雅关闭超时，强制退出');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 拒绝', { reason: reason instanceof Error ? reason.message : String(reason) });
});

export default server;
