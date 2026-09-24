#!/usr/bin/env node
/**
 * 临时：起本地开发服务（后端 3000 无 --watch + 前端 5173），detached + unref。
 * 与 scripts/restart-dev.mjs 的区别：**不用 --watch** —— 本轮发现 --watch 在改后端文件后
 * 重启偶发整进程退出（3000 直接没了），自检期间更需要稳定常驻。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const NODE22 = path.join(process.env.USERPROFILE || '', '.workbuddy', 'binaries', 'node', 'versions', '22.22.2-3', 'node.exe');
const nodeExe = existsSync(NODE22) ? NODE22 : process.execPath;
const LOG = 'C:/Users/胡祖锐/WorkBuddy/2026-09-14-13-52-08/_devlogs';
mkdirSync(LOG, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const listening = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    let done = false;
    const fin = (v) => {
      if (done) return;
      done = true;
      try {
        s.destroy();
      } catch {}
      resolve(v);
    };
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
    setTimeout(() => fin(false), 900);
  });

function freePort(port) {
  const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
  const pids = new Set();
  for (const line of String(r.stdout || '').split(/\r?\n/)) {
    if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue;
    const pid = line.trim().split(/\s+/).pop();
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  for (const pid of pids) spawnSync('taskkill', ['/F', '/PID', pid], { stdio: 'ignore' });
  return pids.size;
}

freePort(3000);
freePort(5173);
await sleep(800);

const beOut = openSync(path.join(LOG, 'be.log'), 'w');
const feOut = openSync(path.join(LOG, 'fe.log'), 'w');
const be = spawn(nodeExe, ['src/server.js'], { cwd: path.join(repo, 'backend'), detached: true, stdio: ['ignore', beOut, beOut] });
be.unref();
const fe = spawn(nodeExe, ['node_modules/vite/bin/vite.js'], { cwd: path.join(repo, 'frontend'), detached: true, stdio: ['ignore', feOut, feOut] });
fe.unref();

for (let i = 0; i < 60; i += 1) {
  if ((await listening(3000)) && (await listening(5173))) break;
  await sleep(500);
}
console.log('后端 3000:', (await listening(3000)) ? 'OK' : '未就绪');
console.log('前端 5173:', (await listening(5173)) ? 'OK' : '未就绪');
process.exit(0);
