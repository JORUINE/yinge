# deploy/ · 国内单机部署全家桶

这套文件是给**阿里云 / 腾讯云一台轻量服务器**用的：一台机器同时跑 Nginx（发网页）+ Node（后端）+ MongoDB（数据库）。

| 文件 | 干什么 | 放哪 |
| --- | --- | --- |
| `nginx.conf` | 发前端静态文件、把 `/api` 反代给后端、顶住 SPA 刷新 404、gzip、缓存 | `/etc/nginx/conf.d/yinge.conf` |
| `ecosystem.config.cjs` | PM2 守护后端：崩了自动拉起、开机自启、内存超了重启、日志落文件 | 仓库根目录（pm2 直接指向它） |
| `deploy.sh` | 一键部署：拉代码 → 装依赖 → 重建前端 → 无缝重启后端 → 自检 | 在**服务器上**执行 |
| `../.github/workflows/deploy.yml` | push 到 main 就自动 SSH 上服务器跑 deploy.sh | 仓库里，配 3 个 Secret 即生效 |

## 最短路径（首次）

```bash
# 1) 服务器上装好 Node 20+ / npm / pm2 / nginx，然后 clone 仓库
git clone https://github.com/JORUINE/yinge.git /opt/yinge
cd /opt/yinge

# 2) 建后端环境变量（密钥只在这里，别提交进 git）
cp backend/.env.example backend/.env
vim backend/.env          # 填 MONGODB_URI / JWT_SECRET / CORS_ORIGINS

# 3) 装 Nginx 配置（改 root 与 server_name 后验语法再 reload）
cp deploy/nginx.conf /etc/nginx/conf.d/yinge.conf
nginx -t && nginx -s reload

# 4) 首次部署 + 开机自启
bash deploy/deploy.sh
pm2 startup && pm2 save
```

## 以后每次更新

```bash
# 在你电脑上：改完代码
git push                     # 若配了 GitHub Actions，到这里已经自动上线了

# 若没配 Actions，或想手动确认：SSH 上服务器
bash deploy/deploy.sh
```

## 三个最容易踩的点

1. **`root` 和 `cwd` 的路径要改成你服务器上的真实路径**（默认写的是 `/opt/yinge`）。
2. **`backend/.env` 不会进 git**，所以每台新服务器都要手动建一次。
3. **`deploy.yml` 里用 `npm ci`**，它要求 `package-lock.json` 在仓库里 —— 前后端都已在，别删。

## 备案没下来之前想先给人玩

把 `nginx.conf` 的 `listen 80;` 改成 `listen 8080;`，并在阿里云安全组放行 8080，
就能用 `http://服务器IP:8080` 访问（域名+80 端口才强制要求备案）。

详见 `docs/部署执行手册.html` 与 `docs/服务器选型与执行路线.html`。
