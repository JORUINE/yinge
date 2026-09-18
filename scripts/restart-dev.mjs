#!/usr/bin/env node
/**
 * 重启本地开发服务（后端 3000 + 前端 5173）—— 给"改完代码自己重启验证"用。
 * ------------------------------------------------------------
 * 为什么不用 .bat：沙箱里不能调 cmd.exe。
 * 为什么用 detached + unref：父进程（本脚本）退出后服务必须继续活着，
 * 否则 agent 回合结束时会把这些子进程一起带走（与 scripts/mongo.mjs 拉起 mongod 同一套路）。
 * 后端用写死的托管 Node 22：系统 Node 18 的 --watch 在本机 Windows 会无限重启（见 start-dev.bat 注释）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const NODE22 = path.join(
  process.env.USERPROFILE || '',
  '.workbuddy',
  'binaries',
  'node',
  'versions',
  '22.22.2-3',
  'node.exe',
);
const nodeExe = existsSync(NODE22) ? NODE22 : process.execPath;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listening(port) {
  return new Promise((resolve) => {
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
}

/** 杀掉占用某端口的进程（用 spawnSync 直接调 netstat/taskkill，不经 shell） */
function freePort(port) {
  const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
  const lines = String(r.stdout || '').split(/\r?\n/);
  const pids = new Set();
  for (const line of lines) {
    if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue;
    const pid = line.trim().split(/\s+/).pop();
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  for (const pid of pids) {
    spawnSync('taskkill', ['/F', '/PID', pid], { stdio: 'ignore' });
    console.log(`  · 已杀掉占用 ${port} 的进程 ${pid}`);
  }
  return pids.size;
}

console.log('重启后端(3000) + 前端(5173)…');
freePort(3000);
freePort(5173);
await sleep(700);

const be = spawn(nodeExe, ['--watch', 'src/server.js'], {
  cwd: path.join(repo, 'backend'),
  detached: true,
  stdio: 'ignore',
});
be.unref();
const fe = spawn(nodeExe, ['node_modules/vite/bin/vite.js'], {
  cwd: path.join(repo, 'frontend'),
  detached: true,
  stdio: 'ignore',
});
fe.unref();

for (let i = 0; i < 40; i += 1) {
  if (await listening(3000)) break;
  await sleep(500);
}
for (let i = 0; i < 40; i += 1) {
  if (await listening(5173)) break;
  await sleep(500);
}
console.log('后端 3000:', (await listening(3000)) ? 'OK' : '未就绪');
console.log('前端 5173:', (await listening(5173)) ? 'OK' : '未就绪');
process.exit(0);
