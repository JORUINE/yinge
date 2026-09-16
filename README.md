# 音格 · 专辑对决与音乐人格测评互动平台

> 2027 届数字媒体技术专业毕业作品 ｜ 四川电影电视学院 · 新媒体学院
> 作者：胡祖锐　｜　选题方向：智能媒体技术 · 赛道C 全栈设计与开发

---

## 一、这是什么

**音格**是一个用「对决」和「测评」两种玩法，帮你选出最爱的专辑、并测出你音乐人格的互动网站。

- **专辑对决**：选歌手 / 多歌手 / 流派 / 年代 / 手动 / 对位赛，系统抓出专辑后分组、逐轮对决，最终选出冠军并生成「夺冠之路」。
- **音乐人格测评**：12 道题（含 2 道听感题）测出音乐人格类型，生成人格卡，并由大语言模型生成个性化解读（不可用时自动降级为模板文案）。

两个玩法共用同一套底层（音乐数据、用户系统、分享图引擎、排行榜）。

## 二、技术栈

| 层次 | 选型 |
|------|------|
| 前端 | Vue 3 · Vite · Vue Router · Pinia · Element Plus · Axios |
| 后端 | Node.js · Express |
| 数据库 | MongoDB · Mongoose（12 张集合） |
| 认证 | JSON Web Token · bcrypt |
| 分享图 | DOM 转图片方案 |
| 音乐数据 | iTunes Search API（免密钥） |
| 文本生成 | 通义千问（DashScope，兼容 OpenAI 格式） |
| 部署 | 前端静态托管 + 后端云托管 + 云数据库 |

## 三、目录结构

```
yinge/
├── docs/          设计与交付文档（开题报告、需求分析、系统设计、API 接口文档、UI 设计稿）
├── frontend/      前端工程（Vue 3 + Vite）
│   └── src/
│       ├── api/        接口封装（与《API 接口文档》一一对应）
│       ├── router/     路由（覆盖原型 19 页）
│       ├── stores/     Pinia 状态
│       ├── layouts/    布局
│       ├── styles/     设计令牌与基础样式
│       └── views/      页面
└── backend/       后端工程（Node.js + Express）
    ├── src/
    │   ├── config/       集中配置（启动即校验）
    │   ├── db/           数据库连接
    │   ├── models/       12 张集合模型
    │   ├── middleware/   鉴权 / 校验 / 错误处理 / 请求标识
    │   ├── modules/      feature-first 业务模块
    │   └── shared/       错误层级 / 日志 / 统一响应
    └── scripts/          seed.js（初始化数据）、smoke.mjs（启动冒烟测试）
```

## 四、本地启动

**后端**

```bash
cd backend
npm install
cp .env.example .env     # 填好 MONGODB_URI 与 JWT_SECRET
npm run seed             # 写入 12 道题、6 个人格类型与管理员账号（幂等）
npm run dev              # 默认 http://localhost:3000
```

健康检查：`GET /health`（存活）、`GET /ready`（就绪，反映数据库状态）。
冒烟测试（不依赖数据库）：`node scripts/smoke.mjs`。

**前端**

```bash
cd frontend
npm install
cp .env.example .env
npm run dev              # 默认 http://localhost:5173，已配置 /api 代理到 3000
```

管理员初始账号：`admin` / `admin123456`（可用 `ADMIN_ACCOUNT`、`ADMIN_PASSWORD` 覆盖）。

## 五、环境变量

> 请勿把密钥提交到仓库。`.env` 已在 `.gitignore` 中排除。

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `NODE_ENV` | 运行环境，默认 `development` | 否 |
| `PORT` | 后端端口，默认 3000 | 否 |
| `LOG_LEVEL` | 日志级别（debug/info/warn/error） | 否 |
| `MONGODB_URI` | MongoDB 连接串 | **是** |
| `JWT_SECRET` | JWT 签名密钥 | **是** |
| `JWT_ACCESS_EXPIRES_IN` | 令牌有效期，默认 2h | 否 |
| `CORS_ORIGINS` | 允许跨域的前端地址，逗号分隔 | 否 |
| `DASHSCOPE_API_KEY` | 通义千问密钥；**留空则人格解读走模板文案** | 否 |
| `QWEN_MODEL` | 模型名，默认 `qwen-plus` | 否 |
| `ITUNES_COUNTRY` | 音乐数据默认地区，默认 `hk` | 否 |
| `ITUNES_COUNTRY_FALLBACK` | 地区回退顺序，默认 `hk,tw,us,cn` | 否 |
| `CACHE_FRESH_DAYS` / `CACHE_STALE_DAYS` | 缓存新鲜度（天），默认 30 / 25 | 否 |
| `VOTE_MIN_INTERVAL_MS` 等 | 防刷票阈值 | 否 |

前端环境变量见 `frontend/.env.example`（`VITE_API_BASE_URL`）。

## 六、数据来源说明

音乐元数据与 30 秒试听片段来自 **iTunes Search API**：

- 无需密钥、无需账号授权，可直接调用
- 提供歌手、专辑、曲目元数据与官方试听片段（`previewUrl`）
- 音频由 Apple 官方服务器提供，本项目不存储、不分发任何音频文件
- 本项目仅将公开接口返回的数据用于展示，并缓存于自己的数据库中

## 七、开发进度

- [x] 选题与开题报告
- [x] 需求分析与系统设计文档
- [x] 数据库设计（12 张集合）
- [x] 后端接口开发（49 个接口，七组）
- [ ] 前端页面开发（骨架与核心页面已就绪，19 页逐步替换占位视图）
- [x] 大语言模型接入（未配置密钥时自动降级为模板）
- [ ] 云端部署上线
- [ ] 系统测试与用户反馈

## 八、许可

本项目为个人毕业设计作品，仅供学习与研究使用。
