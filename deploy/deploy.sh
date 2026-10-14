#!/usr/bin/env bash
# ============================================================================
# 音格 · 一键部署脚本（在**服务器上**执行，不是在你电脑上）
# ----------------------------------------------------------------------------
# 干什么：拉最新代码 → 装依赖 → 重建前端 → 无缝重启后端。
#   以后你改完功能只要 `git push`，再跑一次这个脚本（或让 GitHub Actions 自动跑）就上线了。
#
# 用法：
#   bash deploy/deploy.sh                # 正常部署
#   SKIP_GIT=1 bash deploy/deploy.sh     # 不拉代码，只重建重启（调试用）
#
# 前置条件（只需做一次）：
#   ① 服务器已装 Node 20+、npm、pm2（npm i -g pm2）、nginx
#   ② 仓库已 clone 到服务器，路径与下方 REPO 一致
#   ③ backend/.env 已按 .env.example 建好（密钥都写在那里，别提交进 git）
#   ④ deploy/nginx.conf 已复制到 nginx 配置目录并 reload 过
# ============================================================================
set -euo pipefail

REPO="/opt/yinge"            # ←改：你服务器上仓库的实际路径
LOG_DIR="$REPO/logs"
FRONTEND_DIST="$REPO/frontend/dist"

say() { echo ""; echo "── $* ─────────────────────────────"; }

cd "$REPO"
mkdir -p "$LOG_DIR"

# ── 1. 拉最新代码 ──────────────────────────────────────────────────────────
if [ "${SKIP_GIT:-0}" = "1" ]; then
  echo "· SKIP_GIT=1，跳过拉代码"
else
  say "1/5 拉取最新代码"
  # --ff-only：只有在能"快进"时才拉。若服务器上有未提交改动（不该有）会直接失败，
  # 而不是制造一个难排查的合并提交。
  git fetch origin
  git checkout main
  git pull --ff-only origin main
  echo "· 当前提交：$(git rev-parse --short HEAD)  $(git log -1 --pretty=%s)"
fi

# ── 2. 后端依赖 ────────────────────────────────────────────────────────────
say "2/5 安装后端依赖"
cd "$REPO/backend"
# npm ci：严格按 package-lock.json 装，比 npm install 更可复现
npm ci --omit=dev

# ── 3. 前端依赖 + 构建 ─────────────────────────────────────────────────────
say "3/5 构建前端"
cd "$REPO/frontend"
npm ci
#  vite build 产物落在 dist/，正是 nginx root 指向的目录
npm run build

if [ ! -f "$FRONTEND_DIST/index.html" ]; then
  echo "❌ 构建后找不到 $FRONTEND_DIST/index.html —— 构建失败了，中止（不重启后端）"
  exit 1
fi
echo "· 前端产物就绪：$(ls -1 "$FRONTEND_DIST/assets" | wc -l) 个文件"

# ── 4. 重启后端（零停机）──────────────────────────────────────────────────
say "4/5 重启后端"
cd "$REPO"
# reload 是零停机重载；进程不存在时 reload 会失败，此时退回首启
if pm2 describe yinge-api >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs --update-env
else
  echo "· 首次启动 yinge-api"
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save

# ── 5. 自检 ────────────────────────────────────────────────────────────────
say "5/5 自检"
sleep 2
echo -n "· /health → "
if curl -fsS -m 5 http://127.0.0.1:3000/health; then echo ""; else echo "❌ 没响应（看 pm2 logs yinge-api）"; fi
echo -n "· /ready  → "
if curl -fsS -m 8 http://127.0.0.1:3000/ready; then echo ""; else echo "⚠️ 库可能没连上（看 backend/.env 的 MONGODB_URI）"; fi

say "部署完成"
echo "· 本机自测：curl http://127.0.0.1/health"
echo "· 外网自测：http://你的域名或IP/"
echo "· 看日志：  pm2 logs yinge-api"
