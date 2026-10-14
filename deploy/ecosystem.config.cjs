/**
 * 音格 · PM2 进程守护配置
 * ------------------------------------------------------------------
 * 干什么用：让 Node 后端**崩了能自动拉起**、开机自启、日志落到文件。
 * 没有它，后端哪天因为一个未捕获异常退出，网站就整个打不开，而你并不知道。
 *
 * 用法（在服务器上、仓库根目录执行）：
 *   pm2 start deploy/ecosystem.config.cjs      # 首次启动
 *   pm2 reload deploy/ecosystem.config.cjs     # 改了代码后重载（零停机）
 *   pm2 save && pm2 startup                   # 保存列表 + 设置开机自启
 *   pm2 logs yinge-api                        # 看实时日志
 *   pm2 status                                # 看进程状态
 *
 * ⚠️ 密钥类变量（JWT_SECRET / MONGODB_URI / DASHSCOPE_API_KEY / CORS_ORIGINS）
 *    **不要写在这个文件里** —— 它会进 git 仓库。写在 backend/.env（已被 .gitignore 排除），
 *    PM2 起的 Node 进程会自动读。这里只放不敏感的 NODE_ENV 和 PORT。
 * ⚠️ cwd / 路径按你服务器上的实际路径改（标了 ←改）。
 */
module.exports = {
  apps: [
    {
      name: 'yinge-api',
      cwd: '/opt/yinge/backend',              // ←改：服务器上 backend 的实际路径
      script: 'src/server.js',
      instances: 1,                           // 单实例：熔断器状态存在进程内存里，多实例会各自为政
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '400M',             // 内存超了自动重启，防缓慢泄漏拖垮机器
      env: {
        NODE_ENV: 'production',
        PORT: 3000,                           // 必须与 nginx.conf 里 proxy_pass 的端口一致
      },
      error_file: '/opt/yinge/logs/api-error.log',   // ←改：日志目录
      out_file: '/opt/yinge/logs/api-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
