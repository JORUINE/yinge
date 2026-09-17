#!/usr/bin/env node
/**
 * 本地 MongoDB 启停助手（音格开发用）
 * ------------------------------------------------------------
 * 用法：node scripts/mongo.mjs start | stop | status
 *
 * 为什么用 Node 而不是写进 .bat：
 *   mongod 在 _私密资料-不上传/mongodb 下（路径含中文）。
 *   在批处理里写中文路径容易出编码问题（见工作记忆"本机环境坑"），
 *   交给 Node 处理路径最稳。所以 .bat 只负责调用本脚本。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const mongoRoot = path.resolve(repo, '..', '_私密资料-不上传', 'mongodb');
const mongodExe = path.join(
  mongoRoot,
  'mongodb-win32-x86_64-windows-7.0.14',
  'bin',
  'mongod.exe',
);
const pidFile = path.join(here, '.mongod.pid');
const PORT = 27017;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isListening(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {}
      resolve(v);
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    setTimeout(() => done(false), 900);
  });
}

async function start() {
  if (await isListening(PORT)) {
    console.log('· MongoDB 已在运行（127.0.0.1:' + PORT + '），跳过');
    return;
  }
  if (!existsSync(mongodExe)) {
    console.log('· ⚠ 找不到 mongod.exe：' + mongodExe);
    console.log('  若 MongoDB 已在别处运行可忽略；否则检查 _私密资料-不上传/mongodb 是否还在。');
    return;
  }
  const dataDir = path.join(mongoRoot, 'data');
  const logDir = path.join(mongoRoot, 'log');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });

  const child = spawn(
    mongodExe,
    [
      '--dbpath', dataDir,
      '--port', String(PORT),
      '--bind_ip', '127.0.0.1',
      '--logpath', path.join(logDir, 'mongod.log'),
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  writeFileSync(pidFile, String(child.pid), 'utf8');

  for (let i = 0; i < 40; i += 1) {
    if (await isListening(PORT)) {
      console.log('· MongoDB 已启动（pid ' + child.pid + '）');
      return;
    }
    await sleep(500);
  }
  console.log('· ⚠ MongoDB 20 秒内未就绪，请查看日志：' + path.join(logDir, 'mongod.log'));
}

async function stop() {
  if (!(await isListening(PORT))) {
    console.log('· MongoDB 未在运行');
    return;
  }
  if (!existsSync(pidFile)) {
    console.log('· MongoDB 在运行，但不是本脚本启动的（没有 pid 记录）。');
    console.log('  请在 MongoDB 自己的窗口里 Ctrl+C，或重启电脑。');
    return;
  }
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  try {
    process.kill(pid);
    console.log('· 已停止 MongoDB（pid ' + pid + '）');
  } catch (err) {
    console.log('· 停止失败（可能已退出）：' + err.message);
  }
  try {
    unlinkSync(pidFile);
  } catch {}
}

async function status() {
  console.log('· MongoDB ' + ((await isListening(PORT)) ? '运行中' : '未运行') + '（127.0.0.1:' + PORT + '）');
}

const cmd = (process.argv[2] || 'start').toLowerCase();
if (cmd === 'start') await start();
else if (cmd === 'stop') await stop();
else if (cmd === 'status') await status();
else console.log('用法：node scripts/mongo.mjs start | stop | status');
