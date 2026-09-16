/**
 * 应用装配
 * ------------------------------------------------------------
 * 中间件顺序：请求标识 → 安全头 → 跨域 → 限流 → 解析 → 路由 → 404 → 错误处理。
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { isDbReady, dbState } from './db/connect.js';

import authRoutes from './modules/auth/auth.routes.js';
import musicRoutes from './modules/music/music.routes.js';
import battleRoutes from './modules/battles/battles.routes.js';
import personalityRoutes from './modules/personality/personality.routes.js';
import userRoutes from './modules/users/users.routes.js';
import favoriteRoutes, { shareCardRouter } from './modules/favorites/favorites.routes.js';
import rankRoutes from './modules/rankings/rankings.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(helmet());

  // 跨域：显式来源，生产环境不使用 *
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true); // 同源/服务端调用
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  // 全局限流（更细的投票限流在投票服务内按行为特征判定）
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      // 健康检查不计入限流
      skip: (req) => req.path === '/health' || req.path === '/ready',
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // 健康检查：存活探针
  app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  // 就绪探针：反映数据库真实状态
  app.get('/ready', (req, res) => {
    const ready = isDbReady();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', db: dbState() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/music', musicRoutes);
  app.use('/api/battles', battleRoutes);
  app.use('/api/personality', personalityRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/favorites', favoriteRoutes);
  app.use('/api/share-cards', shareCardRouter);
  app.use('/api/rank', rankRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
