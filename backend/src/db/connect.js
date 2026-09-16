/**
 * 数据库连接
 * ------------------------------------------------------------
 * 启动时连接 MongoDB，连接事件写入结构化日志。
 * 连接失败不直接退出进程：让服务先起来，/ready 反映真实状态，
 * 便于云端部署时区分"服务挂了"与"数据库连不上"。
 */
import mongoose from 'mongoose';
import config from '../config/index.js';
import { logger } from '../shared/logger.js';

mongoose.set('strictQuery', true);

let listenersBound = false;

function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;
  mongoose.connection.on('connected', () =>
    logger.info('MongoDB 已连接', { db: mongoose.connection.name }),
  );
  mongoose.connection.on('error', (err) => logger.error('MongoDB 连接错误', { error: err.message }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB 连接已断开'));
}

export async function connectDb() {
  bindListeners();
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 10,
  });
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.connection.close();
}

const STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

export function dbState() {
  return STATES[mongoose.connection.readyState] || 'unknown';
}

export function isDbReady() {
  return mongoose.connection.readyState === 1;
}
