# 音格 · API 接口文档

> 项目名称：音格——音乐专辑对决与人格测评互动平台

> 文档类型：系统设计文档（组成部分：接口设计）

> 编制人：胡祖锐　　学号：9920250499

> 学院／专业：新媒体学院 · 数字媒体技术（2025级专升本）

> 版本：v1.0　　编制日期：2026 年 9 月 15 日

[TOC]

## 一、文档说明

### 1.1 编写目的

本文档定义"音格"平台前后端之间的接口契约，明确每个接口的请求方式、路径、参数、鉴权要求与返回结构。本文档同时作为后端开发的实现依据、前端联调的对接依据与系统测试的验证依据。

### 1.2 读者对象

前端开发者、后端开发者、测试人员与答辩评审。

### 1.3 依据文档

《音格需求分析文档》v1.0。接口与其中的功能需求编号（FR-XX）、页面清单一一对应。

## 二、接口规范总则

### 2.1 基础信息

| 项目 | 约定 |
| --- | --- |
| 基础路径 | `/api` |
| 数据格式 | 请求与响应均为 `application/json`，字符编码 UTF-8 |
| 传输协议 | 开发环境 HTTP，线上环境 HTTPS |
| 接口风格 | RESTful，资源名用复数名词，动作用 HTTP 方法表达 |
| 时间格式 | ISO 8601 字符串，如 `2026-09-15T14:30:00.000Z` |
| 音乐数据地区 | 默认 `hk`，回退顺序 `hk → tw → us → cn`，可用环境变量 `ITUNES_COUNTRY` 覆盖 |
| 封面地址 | 接口返回 100×100 地址，服务端将路径中的 `100x100bb` 替换为 `600x600bb` 或更大尺寸后使用 |

### 2.2 统一响应结构

所有接口（含错误）均返回如下结构，前端只需判断 `code` 字段：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| code | number | 业务状态码，`0` 表示成功，非 0 表示失败 |
| message | string | 提示信息，失败时为可展示给用户的文案 |
| data | object / array / null | 业务数据，失败时为 `null` |

### 2.3 业务状态码

| 状态码 | 含义 | 前端处理 |
| --- | --- | --- |
| 0 | 成功 | 正常取用 data |
| 1001 | 参数校验失败 | 提示 message |
| 1002 | 资源不存在 | 提示并返回上一页 |
| 1003 | 操作过于频繁 | 提示稍后重试 |
| 2001 | 未登录或登录已过期 | 跳转登录页 |
| 2002 | 权限不足 | 提示无权限 |
| 2003 | 账号已被禁用 | 提示并清除本地登录态 |
| 3001 | 重复操作（如重复投票） | 提示 message，不改变数据 |
| 4001 | 外部音乐接口异常 | 提示使用缓存数据或稍后重试 |
| 4002 | 文本生成服务异常 | 静默降级为模板文案 |
| 5000 | 服务器内部错误 | 提示系统繁忙 |

### 2.4 认证方式

除标注为"公开"的接口外，其余接口均需在请求头携带令牌：

```json
{
  "Authorization": "Bearer <token>"
}
```

令牌由登录接口返回，前端保存于本地存储，并在每次请求时附带。令牌含有效期，过期后服务端返回 `2001`，前端跳转登录页。

后台接口除校验令牌外，还校验用户角色是否为管理员，否则返回 `2002`。

### 2.5 分页约定

列表类接口统一使用以下查询参数与返回结构。

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| page | number | 1 | 页码，从 1 开始 |
| pageSize | number | 20 | 每页条数，上限 100 |

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [],
    "total": 128,
    "page": 1,
    "pageSize": 20
  }
}
```

### 2.6 接口总览

| 编号 | 模块 | 方法 | 路径 | 鉴权 | 对应需求 |
| --- | --- | --- | --- | --- | --- |
| A-01 | 认证 | POST | /api/auth/register | 公开 | FR-01 |
| A-02 | 认证 | POST | /api/auth/login | 公开 | FR-02 |
| A-03 | 认证 | GET | /api/auth/me | 需要 | FR-02 |
| A-04 | 认证 | POST | /api/auth/logout | 需要 | FR-02 |
| A-05 | 认证 | PUT | /api/users/me | 需要 | FR-03 |
| A-06 | 认证 | GET | /api/users/me/stats | 需要 | FR-03 |
| M-01 | 音乐数据 | GET | /api/music/artists/search | 公开 | FR-05、FR-28、FR-29 |
| M-02 | 音乐数据 | GET | /api/music/artists/:artistId | 公开 | FR-05 |
| M-03 | 音乐数据 | GET | /api/music/artists/:artistId/albums | 公开 | FR-06 |
| M-04 | 音乐数据 | GET | /api/music/albums/:albumId | 公开 | FR-06 |
| M-05 | 音乐数据 | GET | /api/music/albums/:albumId/tracks | 公开 | FR-06 |
| M-06 | 音乐数据 | GET | /api/music/albums/:albumId/preview | 公开 | FR-12 |
| M-07 | 音乐数据 | GET | /api/music/genres | 公开 | FR-05 |
| B-01 | 专辑对决 | POST | /api/battles | 需要 | FR-08、FR-26、FR-27、FR-33 |
| B-02 | 专辑对决 | GET | /api/battles/:id | 需要 | FR-08 |
| B-03 | 专辑对决 | GET | /api/battles/:id/next-match | 需要 | FR-09 |
| B-04 | 专辑对决 | POST | /api/battles/:id/matches/:matchId/vote | 需要 | FR-09 |
| B-05 | 专辑对决 | POST | /api/battles/:id/revival | 需要 | FR-10 |
| B-06 | 专辑对决 | GET | /api/battles/:id/result | 需要 | FR-11 |
| B-07 | 专辑对决 | GET | /api/battles | 需要 | FR-03 |
| B-08 | 专辑对决 | DELETE | /api/battles/:id | 需要 | FR-03 |
| P-01 | 人格测评 | GET | /api/personality/questions | 公开 | FR-13 |
| P-02 | 人格测评 | POST | /api/personality/submit | 需要 | FR-14 |
| P-03 | 人格测评 | GET | /api/personality/results/:id | 需要 | FR-15 |
| P-04 | 人格测评 | GET | /api/personality/results | 需要 | FR-03 |
| P-05 | 人格测评 | GET | /api/personality/types | 公开 | FR-20 |
| P-06 | 人格测评 | GET | /api/personality/types/:code | 公开 | FR-20 |
| P-07 | 人格测评 | GET | /api/personality/stats | 公开 | FR-20 |
| U-01 | 收藏与分享 | POST | /api/favorites | 需要 | FR-04 |
| U-02 | 收藏与分享 | DELETE | /api/favorites/:targetId | 需要 | FR-04 |
| U-03 | 收藏与分享 | GET | /api/favorites | 需要 | FR-04 |
| U-04 | 收藏与分享 | POST | /api/share-cards | 需要 | FR-18 |
| U-05 | 收藏与分享 | GET | /api/share-cards | 需要 | FR-18 |
| R-01 | 排行榜 | GET | /api/rank/albums | 公开 | FR-19 |
| R-02 | 排行榜 | GET | /api/rank/home | 公开 | FR-19 |
| D-01 | 后台 | POST | /api/admin/login | 公开 | FR-25 |
| D-02 | 后台 | GET | /api/admin/dashboard | 管理员 | FR-25 |
| D-03 | 后台 | GET | /api/admin/questions | 管理员 | FR-21 |
| D-04 | 后台 | POST | /api/admin/questions | 管理员 | FR-21 |
| D-05 | 后台 | PUT | /api/admin/questions/:id | 管理员 | FR-21 |
| D-06 | 后台 | DELETE | /api/admin/questions/:id | 管理员 | FR-21 |
| D-07 | 后台 | GET | /api/admin/types | 管理员 | FR-22 |
| D-08 | 后台 | POST | /api/admin/types | 管理员 | FR-22 |
| D-09 | 后台 | PUT | /api/admin/types/:id | 管理员 | FR-22 |
| D-10 | 后台 | DELETE | /api/admin/types/:id | 管理员 | FR-22 |
| D-11 | 后台 | GET | /api/admin/music | 管理员 | FR-23 |
| D-12 | 后台 | POST | /api/admin/music/refresh | 管理员 | FR-23 |
| D-13 | 后台 | GET | /api/admin/users | 管理员 | FR-24 |
| D-14 | 后台 | PUT | /api/admin/users/:id/status | 管理员 | FR-24 |

## 三、认证与用户接口

### 3.1 注册　POST /api/auth/register　（公开）

创建新用户账号，密码经单向加密后存储。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| account | string | 是 | 账号，4 至 20 位字母或数字，全局唯一 |
| password | string | 是 | 密码，6 至 32 位 |
| nickname | string | 否 | 昵称，缺省时默认为账号 |

```json
{
  "code": 0,
  "message": "ok",
  "data": { "userId": "6512f0a3c9e77b1d2a4f8e10", "account": "huzurui" }
}
```

失败情形：账号已存在返回 `1001`；参数不合规返回 `1001`。

### 3.2 登录　POST /api/auth/login　（公开）

校验账号密码，成功后返回令牌与用户信息。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| account | string | 是 | 账号 |
| password | string | 是 | 密码 |

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 604800,
    "user": { "userId": "6512f...", "account": "huzurui", "nickname": "祖锐", "role": "user" }
  }
}
```

失败情形：账号或密码错误返回 `1001`；账号被禁用返回 `2003`。

### 3.3 获取当前用户　GET /api/auth/me　（需要登录）

用于页面刷新后恢复登录态。

```json
{
  "code": 0,
  "message": "ok",
  "data": { "userId": "6512f...", "account": "huzurui", "nickname": "祖锐", "role": "user" }
}
```

### 3.4 退出登录　POST /api/auth/logout　（需要登录）

服务端记录令牌失效，前端清除本地存储。

```json
{ "code": 0, "message": "ok", "data": null }
```

### 3.5 修改个人资料　PUT /api/users/me　（需要登录）

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| nickname | string | 否 | 新昵称 |
| oldPassword | string | 否 | 原密码，修改密码时必填 |
| newPassword | string | 否 | 新密码，修改密码时必填 |

```json
{ "code": 0, "message": "ok", "data": { "updated": true } }
```

### 3.6 个人统计　GET /api/users/me/stats　（需要登录）

用于个人中心顶部概览。

```json
{
  "code": 0,
  "message": "ok",
  "data": { "battleCount": 6, "voteCount": 78, "testCount": 3, "favoriteCount": 12 }
}
```

## 四、音乐数据接口

### 4.1 搜索歌手　GET /api/music/artists/search　（公开）

检索歌手并返回候选列表，由用户确认后再查询专辑。**服务端必须做相关性校验。**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| keyword | string | 是 | 歌手名称关键词，支持中文、繁体与英文 |
| limit | number | 否 | 候选数量，默认 5，上限 10 |

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      { "artistId": 300117743, "name": "周杰倫", "genre": "国语流行", "albumCount": 48, "relevance": "high" },
      { "artistId": 216635866, "name": "林俊傑", "genre": "国语流行", "albumCount": 80, "relevance": "low" }
    ]
  }
}
```

**返回字段说明**

| 字段 | 说明 |
| --- | --- |
| name | 官方歌手名，可能为繁体或罗马字，前端原样展示，不可自行转换 |
| albumCount | 该歌手名下专辑总数（未过滤），供用户判断是否为要找的人 |
| relevance | 相关性等级：`high` 名称直接命中；`low` 疑似但未命中（如关键词为中文而返回罗马字名） |

**地区与相关性约定**

（1）请求外部接口时的地区参数由服务端配置注入，默认 `hk`。**不得使用 `cn`**——实测大陆区对大量华语歌手无收录（李荣浩、邓紫棋、薛之谦、毛不易等在 `cn` 区均检索不到），且**无匹配结果时不返回空数组，而是返回无关歌手**（搜索这些名字会返回「周杰倫」）；

（2）地区回退顺序 `hk → tw → us → cn`，前一地区返回空或全部低相关时依次尝试下一个；

（3）当候选全部为 `low` 相关时，返回 `code: 1002` 与空列表，`message` 为"未找到相关歌手，请尝试其他写法"，**不得把低相关结果当作命中直接返回**；

（4）实测各地覆盖情况：华语与海外歌手在 `hk` 区均可检索（Taylor Swift 200 张、Ed Sheeran 196 张、邓紫棋 92 张、毛不易 75 张）；日文名歌手可能返回罗马字（`米津玄師` → `Kenshi Yonezu`），此时按低相关处理但仍展示，由用户判断。

**缓存约定**：优先查询本地缓存；未命中时请求外部接口并将结果写入数据库。外部接口不可用时返回已有缓存并在 `message` 中提示，不返回错误码。

### 4.2 歌手详情　GET /api/music/artists/:artistId　（公开）

```json
{
  "code": 0,
  "message": "ok",
  "data": { "artistId": 455208, "name": "周杰伦", "genre": "国语流行", "albumCount": 31, "cachedAt": "2026-09-15T06:00:00.000Z" }
}
```

### 4.3 歌手专辑列表　GET /api/music/artists/:artistId/albums　（公开）

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| forceRefresh | boolean | 否 | 为 true 时跳过缓存重新拉取 |

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      {
        "albumId": 1440928842,
        "name": "范特西",
        "artistId": 455208,
        "artistName": "周杰伦",
        "artworkUrl": "https://.../100x100bb.jpg",
        "trackCount": 10,
        "releaseDate": "2001-09-14T07:00:00.000Z"
      }
    ]
  }
}
```

### 4.4 专辑详情　GET /api/music/albums/:albumId　（公开）

返回单个专辑的完整信息，字段同 4.3 中的专辑对象。

### 4.5 专辑曲目　GET /api/music/albums/:albumId/tracks　（公开）

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      { "trackId": 1440928850, "name": "爱在西元前", "duration": 234000, "hasPreview": true }
    ]
  }
}
```

### 4.6 获取试听曲目　GET /api/music/albums/:albumId/preview　（公开）

返回该专辑的试听曲目列表与默认试听项，供投票页播放与切换。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| trackIndex | number | 否 | 指定曲序，从 1 开始；省略时返回列表与默认项 |

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "albumId": 1440928842,
    "total": 10,
    "defaultIndex": 1,
    "current": { "trackId": 1440928850, "trackName": "爱在西元前", "trackNumber": 1, "previewUrl": "https://.../preview.m4a" },
    "tracks": [
      { "trackId": 1440928850, "trackName": "爱在西元前", "trackNumber": 1, "previewUrl": "https://.../preview.m4a" }
    ]
  }
}
```

**曲目选择约定**

（1）**默认取曲序第 1 首**作为代表曲。外部音乐接口不提供单曲热度数据，无法按播放量排序；曲序第一首通常是专辑主打，是当前可得的最接近"代表作"的信号；

（2）**不要求用户预先选择代表曲**——对决的对象是专辑而非单曲，代表曲只用于辅助试听、不参与计票，因此不增加额外选择步骤，避免界面臃肿；

（3）前端在播放条上提供上一首 / 下一首切换（对应 `trackIndex` 递增递减）。无可用曲目或该专辑无试听片段时 `current` 为 `null`，前端隐藏播放按钮。

### 4.7 流派列表　GET /api/music/genres　（公开）

返回平台已缓存的流派标签，用于对决范围选择的筛选条件。

```json
{
  "code": 0,
  "message": "ok",
  "data": { "list": [{ "genre": "国语流行", "albumCount": 128 }] }
}
```

## 五、专辑对决接口

### 5.1 创建对决　POST /api/battles　（需要登录）

按选定范围创建一次对决。服务端先对候选专辑执行准入过滤，再按用户确认的名单生成对阵表并写入数据库。

支持六种范围模式：

| scopeType | 含义 | 必填参数 |
| --- | --- | --- |
| `artist` | 单歌手，该歌手的专辑互相比 | `artistId`（必填；可选 `albumCount` 限制张数） |
| `multi-artist` | **多歌手混战**，各位歌手的专辑进入同一池 | `artists` |
| `genre` / `era` | 按流派或年代 | `scopeKey`（`albumIds` 可选，用于收窄） |
| `custom` | 手动挑选 | `albumIds` |
| `aligned` | **对位赛**，2 至 4 位歌手按发行日期先后逐张对位，第 k 张对第 k 张 | `artists` + `alignCount` |
| `duel` | **指定对决**，用户逐行指定对位组（每组 2 张，可跨歌手与年代） | `pairs` |

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| scopeType | string | 是 | 取值见上表 |
| alignCount | number | 否 | `aligned` 模式下的对位张数，默认 5，上限取各歌手专辑数的较小值 |
| scopeKey | string | 否 | `artist` / `genre` / `era` 模式下的关键字 |
| artists | object[] | 否 | `multi-artist` / `aligned` 模式下的歌手列表，最少 2 位、最多 6 位（`aligned` 最多 4 位） |
| artists[].artistId | number | 是 | 歌手唯一标识 |
| artists[].albumCount | number | 否 | `multi-artist` 模式下该歌手"最多取前 N 张"参赛（按发行时间升序），不填=取全部合格专辑 |
| albumCount | number | 否 | 顶层参数：`artist` 模式下限制参赛张数（按发行时间升序取前 N 张）；`multi-artist` 请改用 `artists[].albumCount` |
| albumIds | string[] | 否 | `custom` 模式下手动指定的专辑 |
| pairs | array | 否 | `duel` 模式下的对位组：二维数组，每个元素为 `[专辑标识A, 专辑标识B]`（外部数字标识），最少 1 组、组数不设上限 |
| alignMode | string | 否 | `aligned` 模式下的配对方式：`ordinal`（同序号，默认）/ `chrono`（年代就近） |

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "battleId": "6512f1b2c9e77b1d2a4f8e22",
    "scopeType": "multi-artist",
    "artists": [
      { "artistId": 300117743, "name": "周杰倫", "picked": 4 },
      { "artistId": 216635866, "name": "林俊傑", "picked": 3 },
      { "artistId": 137938148, "name": "陳奕迅", "picked": 3 }
    ],
    "albumCount": 10,
    "roundCount": 3,
    "hasBye": false,
    "matchCount": 13,
    "filtered": { "single": 41, "live": 9, "soundtrack": 3, "compilation": 12 }
  }
}
```

**`filtered` 字段**：返回本次因准入规则被剔除的专辑数量，按原因分类。用于前端展示"已自动过滤 X 张单曲 / 现场 / 原声 / 精选"，对应需求 FR-27 与 US-20。

**专辑准入规则（服务端实现）**

| 序号 | 规则 | 判定 |
| --- | --- | --- |
| 1 | 类型与体量 | 返回类型必须为 Album，排除 Single 与 EP；曲目数不少于 7 首 |
| 2 | 归属 | 按 `artistId` 比对，**不按名称比对**（同一歌手在不同接口中可能返回简繁体不同的名字） |
| 3 | 非现场 | 名称不得匹配 现场｜演唱会｜音乐会 |
| 4 | 非原声 | 名称不得匹配 原声带｜OST |
| 5 | 非精选 | 名称不得匹配 精选｜合集 |
| 6 | 非合辑 | 名称不得匹配 拼盘｜合辑；且不得含多歌手连接符 |
| 7 | 同名去重 | 同名专辑只保留最早发行、且不带豪华版后缀的版本 |

实测该规则的效果：周杰伦 48 张筛出 17 张、林俊杰 80 张筛出 16 张、陈奕迅 122 张筛出 44 张、李荣浩 48 张筛出 8 张。

失败情形：过滤后专辑少于 4 张返回 `1001`；范围无法解析或歌手检索无相关结果返回 `1002`；`multi-artist` 模式下歌手少于 2 位或超过 6 位返回 `1001`；`duel` 模式下 `pairs` 为空、某组不足 2 张或专辑标识无效返回 `1001`。

说明：返回体中的 `hasBye` 表示是否安排了轮空（参赛数为奇数时为 `true`），该字段是"轮空处理"逻辑的直接体现；`filtered` 则体现准入过滤逻辑。

### 5.2 对决详情　GET /api/battles/:id　（需要登录）

返回对决基本信息与完整对阵表。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "battleId": "6512f1b2c9e77b1d2a4f8e22",
    "status": "playing",
    "roundCount": 4,
    "currentRound": 2,
    "championAlbumId": null,
    "matches": [
      {
        "matchId": "6512f1b2c9e77b1d2a4f8e30",
        "roundIndex": 1,
        "isRevival": false,
        "leftAlbum": { "albumId": 1440928842, "name": "范特西", "artworkUrl": "https://..." },
        "rightAlbum": { "albumId": 1440929700, "name": "叶惠美", "artworkUrl": "https://..." },
        "winnerAlbumId": 1440928842,
        "voteCount": 37
      }
    ]
  }
}
```

### 5.3 获取下一场待投票场次　GET /api/battles/:id/next-match　（需要登录）

前端据此渲染投票页。当前轮次全部投完时，服务端自动结算并推进到下一轮。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "finished": false,
    "matchId": "6512f1b2c9e77b1d2a4f8e30",
    "roundName": "semi",
    "roundIndex": 1,
    "isRevival": false,
    "isBye": false,
    "left": { "albumId": 1440928842, "name": "范特西", "artworkUrl": "https://...", "previewUrl": "https://..." },
    "right": { "albumId": 1440929700, "name": "叶惠美", "artworkUrl": "https://...", "previewUrl": "https://..." },
    "progress": { "decided": 12, "total": 15 }
  }
}
```

说明：`left` / `right` 中的 `albumId` 是**外部专辑标识**（数字），投票时原样回传即可；`previewUrl` 为 30 秒试听地址，为空表示该专辑暂无试听资源。
`finished` 为 `true` 表示全部场次已投完，前端跳转结果页，此时 `left`、`right` 为 `null`。
`progress` 给出已投场次与总场次，其中 `total` 恒等于创建对决时返回的 `matchTotal`（由赛制推导）。

### 5.4 投票　POST /api/battles/:id/matches/:matchId/vote　（需要登录）

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| albumId | string / number | 是 | 所投专辑的**外部专辑标识**（与上场次中的 `albumId` 一致），必须是该场次的左或右一方 |

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "invalid": false,
    "matchId": "6512f1b2c9e77b1d2a4f8e30",
    "winnerAlbumId": 1440928842,
    "leftVotes": 14,
    "rightVotes": 6,
    "progress": { "decided": 13, "total": 15 }
  }
}
```

说明：`winnerAlbumId` 为外部专辑标识；`invalid` 为 `true` 表示该票被判定为异常（不计入统计），此时 `message` 给出原因。

失败情形：同一场次重复投票返回 `3001`；`albumId` 不属于该场次返回 `1001`；两次投票间隔过短返回 `1003`（该票不计违规）。

### 5.5 确认复活赛　POST /api/battles/:id/revival　（需要登录）

小组赛结束后调用。服务端按规则选出复活专辑并生成复活赛场次。若该对决不含复活赛，返回 `1001`。

```json
{
  "code": 0,
  "message": "ok",
  "data": { "revivedAlbumIds": [1440929700], "newMatchCount": 1 }
}
```

### 5.6 对决结果　GET /api/battles/:id/result　（需要登录）

返回冠军与完整的夺冠路径，供结果页与分享图使用。当 `scopeType` 为 `aligned` 或 `duel` 时不产生单一冠军，改为返回逐行对照表（`type` 为 `aligned`，含 `rows` 与按歌手的 `points`）。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "champion": { "albumId": 1440928842, "name": "范特西", "artistName": "周杰伦", "artworkUrl": "https://..." },
    "path": [
      { "roundIndex": 1, "opponentName": "叶惠美", "winVotes": 37, "loseVotes": 22 },
      { "roundIndex": 2, "opponentName": "十一月的萧邦", "winVotes": 41, "loseVotes": 18 }
    ],
    "totalVotes": 128
  }
}
```

### 5.7 我的对决列表　GET /api/battles　（需要登录）

支持分页，参数同 2.5 节。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      { "battleId": "6512f...", "scopeKey": "周杰伦", "status": "finished", "championName": "范特西", "createdAt": "2026-09-15T06:10:00.000Z" }
    ],
    "total": 6,
    "page": 1,
    "pageSize": 20
  }
}
```

### 5.8 删除对决记录　DELETE /api/battles/:id　（需要登录）

仅可删除属于自己的对决，否则返回 `2002`。

```json
{ "code": 0, "message": "ok", "data": { "deleted": true } }
```

## 六、音乐人格测评接口

### 6.1 获取题目　GET /api/personality/questions　（公开）

按 `order` 顺序返回全部题目。听感题带试听地址。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      {
        "questionId": "6512f2a1c9e77b1d2a4f8f01",
        "order": 1,
        "type": "normal",
        "title": "听到一首陌生的歌，你最先注意到的是？",
        "options": [
          { "key": "A", "text": "旋律好不好听", "scores": { "melody": 2 } },
          { "key": "B", "text": "编曲的层次", "scores": { "texture": 2 } }
        ]
      },
      {
        "questionId": "6512f2a1c9e77b1d2a4f8f07",
        "order": 7,
        "type": "audio",
        "title": "听完这段片段，你的第一感觉是？",
        "audioUrl": "https://.../preview.m4a",
        "options": [
          { "key": "A", "text": "想跟着动起来", "scores": { "rhythm": 2 } },
          { "key": "B", "text": "想安静听完", "scores": { "calm": 2 } }
        ]
      }
    ]
  }
}
```

说明：选项中的 `scores` 即计分维度权重，是"结果可复现"的依据——同一组答案必然得到同一得分。

### 6.2 提交作答　POST /api/personality/submit　（需要登录）

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| answers | object[] | 是 | 作答数组 |
| answers[].questionId | string | 是 | 题目 ID |
| answers[].optionKey | string | 是 | 所选选项标识 |

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "resultId": "6512f3c4c9e77b1d2a4f9011",
    "typeCode": "MEL",
    "typeName": "旋律捕手",
    "scores": { "melody": 9, "rhythm": 5, "calm": 4, "texture": 6 },
    "aiComment": "你对旋律的敏感度很高……",
    "aiCommentSource": "llm",
    "recommendAlbums": [
      { "albumId": 1440928842, "name": "范特西", "artworkUrl": "https://..." }
    ]
  }
}
```

说明：`aiCommentSource` 取值 `llm` 表示由大语言模型生成，`template` 表示因调用失败而使用模板兜底。该字段保证降级行为对前端透明、对测试可验证。

失败情形：答案数量不足或题目 ID 不合法返回 `1001`。

### 6.3 获取测评结果　GET /api/personality/results/:id　（需要登录）

返回与提交时一致的结果内容，用于"我的测评记录"回看，不重复调用文本生成接口。

### 6.4 我的测评记录　GET /api/personality/results　（需要登录）

支持分页，返回该用户的全部测评结果摘要。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      { "resultId": "6512f...", "typeCode": "MEL", "typeName": "旋律捕手", "createdAt": "2026-09-15T06:20:00.000Z" }
    ],
    "total": 3,
    "page": 1,
    "pageSize": 20
  }
}
```

### 6.5 人格类型列表（图鉴）　GET /api/personality/types　（公开）

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      { "code": "MEL", "name": "旋律捕手", "description": "对旋律线极度敏感……", "userCount": 128, "ratio": 0.21 }
    ]
  }
}
```

### 6.6 人格类型详情　GET /api/personality/types/:code　（公开）

返回该类型的完整描述与推荐专辑列表，字段同上并增加 `recommendAlbums`。

**推荐专辑的生成规则**（对应 FR-15）

（1）每种人格类型在数据库中配有一个"推荐专辑池"（`personality_types.recommendAlbumIds`），生成推荐时从该池取 3 张；

（2）池内排序依据用户**得分最高的维度**，接口返回推荐项时附带 `matchedDimension` 与 `matchedScore` 两个字段，供前端展示"匹配 旋律敏感 9/10"这类说明——推荐必须能解释，不能是黑盒；

（3）池子的来源分两步：**初期由管理员在后台手工维护**（每类 6 至 10 张，对应 FR-22 人格类型管理）；**后续可根据真实行为统计自动补充**，例如"该类型用户在对决中投票胜率最高的专辑"；

（4）若某类型池为空，降级为按最高得分维度对应的风格标签在全库筛选，仍不足时返回空数组，前端隐藏推荐区，不展示占位内容。

### 6.7 类型占比统计　GET /api/personality/stats　（公开）

供图鉴页绘制分布图。

```json
{
  "code": 0,
  "message": "ok",
  "data": { "totalUsers": 612, "distribution": [{ "code": "MEL", "name": "旋律捕手", "count": 128, "ratio": 0.21 }] }
}
```

## 七、收藏与分享接口

### 7.1 添加收藏　POST /api/favorites　（需要登录）

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| targetType | string | 是 | 收藏对象类型：`album` / `battle` / `personality` |
| targetId | string | 是 | 对象 ID |

```json
{ "code": 0, "message": "ok", "data": { "favoriteId": "6512f4d5c9e77b1d2a4fa101" } }
```

失败情形：重复收藏返回 `3001`。

### 7.2 取消收藏　DELETE /api/favorites/:targetId　（需要登录）

```json
{ "code": 0, "message": "ok", "data": { "deleted": true } }
```

### 7.3 我的收藏　GET /api/favorites　（需要登录）

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| targetType | string | 否 | 按类型筛选，缺省返回全部 |

返回结构为分页列表，元素含 `targetType`、`targetId` 与对象的展示信息（名称、封面）。

### 7.4 保存分享图记录　POST /api/share-cards　（需要登录）

分享图由前端生成，本接口仅记录归属，便于"我的分享"找回。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| type | string | 是 | 分享图类型：`battle` / `personality` |
| refId | string | 是 | 关联的对决 ID 或测评结果 ID |
| imageUrl | string | 否 | 图片存储地址，缺省时仅记录生成行为 |

```json
{ "code": 0, "message": "ok", "data": { "shareCardId": "6512f5e6c9e77b1d2a4fb201" } }
```

### 7.5 我的分享图　GET /api/share-cards　（需要登录）

支持分页，返回该用户生成的分享图记录列表。

## 八、排行榜接口

### 8.1 最受欢迎专辑榜　GET /api/rank/albums　（公开）

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| scopeType | string | 否 | 筛选范围类型 |
| scopeKey | string | 否 | 筛选关键字 |
| period | string | 否 | 统计周期：`all`（默认）/ `week` / `month` |
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页条数 |

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      { "rank": 1, "albumId": 1440928842, "name": "范特西", "artistName": "周杰伦", "artworkUrl": "https://...", "winCount": 24, "voteCount": 386 }
    ],
    "total": 213,
    "page": 1,
    "pageSize": 20
  }
}
```

说明：排序依据为累计得票数，并列时以胜场数次序排列。

### 8.2 首页概览　GET /api/rank/home　（公开）

一次请求返回首页所需的全部数据，减少首屏请求次数。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "topAlbums": [],
    "hotArtists": [{ "artistId": 455208, "name": "周杰伦", "battleCount": 42 }],
    "stats": { "userCount": 612, "battleCount": 318, "voteCount": 18642 }
  }
}
```

## 九、后台管理接口

后台全部接口均需管理员令牌，路径前缀为 `/api/admin`。

### 9.1 后台登录　POST /api/admin/login　（公开）

参数与返回同 3.2 节，但校验角色必须为管理员，否则返回 `2002`。

### 9.2 数据看板　GET /api/admin/dashboard　（管理员）

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "userCount": 612,
    "battleCount": 318,
    "voteCount": 18642,
    "resultCount": 487,
    "typeDistribution": [{ "code": "MEL", "count": 128, "ratio": 0.21 }],
    "dailyTrend": [{ "date": "2026-09-15", "battleCount": 26, "voteCount": 1420 }]
  }
}
```

### 9.3 题目管理

| 接口 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 题目列表 | GET | /api/admin/questions | 支持分页与关键词筛选 |
| 新增题目 | POST | /api/admin/questions | 参数含 order、type、title、options |
| 修改题目 | PUT | /api/admin/questions/:id | 可改题干、选项、分值与排序 |
| 删除题目 | DELETE | /api/admin/questions/:id | 删除后不影响既有测评结果 |

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "questionId": "6512f2a1c9e77b1d2a4f8f01",
    "order": 1,
    "type": "normal",
    "title": "听到一首陌生的歌，你最先注意到的是？",
    "options": [{ "key": "A", "text": "旋律好不好听", "scores": { "melody": 2 } }]
  }
}
```

### 9.4 人格类型管理

| 接口 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 类型列表 | GET | /api/admin/types | 含各类型人数 |
| 新增类型 | POST | /api/admin/types | 参数含 code、name、description、recommendAlbumIds |
| 修改类型 | PUT | /api/admin/types/:id | 修改描述与推荐专辑 |
| 删除类型 | DELETE | /api/admin/types/:id | 已被引用的类型不允许删除，返回 `3001` |

### 9.5 音乐数据管理

| 接口 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 缓存列表 | GET | /api/admin/music | 按歌手或专辑维度分页查看缓存 |
| 刷新缓存 | POST | /api/admin/music/refresh | 参数 scopeType 与 scopeKey，重新拉取并覆盖本地数据 |

```json
{
  "code": 0,
  "message": "ok",
  "data": { "refreshed": { "artists": 1, "albums": 31, "tracks": 412 }, "cachedAt": "2026-09-15T06:30:00.000Z" }
}
```

### 9.6 用户管理

| 接口 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 用户列表 | GET | /api/admin/users | 支持按账号、昵称、状态筛选 |
| 修改用户状态 | PUT | /api/admin/users/:id/status | 参数 status：`active` / `disabled` |

```json
{
  "code": 0,
  "message": "ok",
  "data": { "userId": "6512f...", "status": "disabled", "effectiveAt": "2026-09-15T06:31:00.000Z" }
}
```

说明：禁用后该用户的令牌在下次校验时被拒绝，接口返回 `2003`。

## 十、关键数据结构

### 10.1 专辑对象

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| albumId | number | 专辑外部标识 |
| name | string | 专辑名称 |
| artistId | number | 所属歌手标识 |
| artistName | string | 歌手名称（聚合时填充） |
| artworkUrl | string | 封面地址 |
| trackCount | number | 曲目数 |
| releaseDate | string | 发行日期 |

### 10.2 对决对象

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| battleId | string | 对决标识 |
| userId | string | 发起用户 |
| scopeType | string | 范围模式：`artist` / `multi-artist` / `genre` / `era` / `custom` / `aligned` / `duel` |
| scopeKey | string | 范围关键字（单范围模式使用） |
| artists | array | 多歌手模式下参与的歌手标识与各自抽取数量 |
| status | string | `playing` / `finished` |
| roundCount / currentRound | number | 总轮次与当前轮次 |
| hasBye | boolean | 是否安排了轮空 |
| championAlbumId | string | 冠军专辑，未结束时为 `null` |

### 10.3 测评结果对象

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| resultId | string | 结果标识 |
| userId | string | 作答用户 |
| typeCode / typeName | string | 人格类型码与名称 |
| scores | object | 各维度得分 |
| aiComment | string | 个性化解读文本 |
| aiCommentSource | string | `llm` 或 `template` |
| recommendAlbums | array | 推荐专辑列表 |

## 十一、典型调用时序

以下为"完成一次专辑对决"的完整接口调用顺序，可直接作为联调与测试的脚本依据。

（1）`POST /api/auth/login` 获取令牌；

（2）`GET /api/music/artists/search?keyword=周杰伦` 取得歌手标识；

（3）`GET /api/music/artists/:artistId/albums` 取得全部专辑（首次请求会写入缓存）；

（4）`POST /api/battles` 创建对决，返回对阵表规模与是否含轮空；

（5）循环调用 `GET /api/battles/:id/next-match` 取下一场，用户点击试听时使用返回体中的 `previewUrl`；

（6）每场结束后调用 `POST /api/battles/:id/matches/:matchId/vote` 提交选择；

（7）小组赛结束时按需调用 `POST /api/battles/:id/revival` 确认复活赛；

（8）全部轮次结束后 `GET /api/battles/:id/result` 获取冠军与夺冠路径；

（9）前端生成分享图后调用 `POST /api/share-cards` 记录归属。

## 十二、接口设计与需求的对应说明

（1）**数据驱动**：M-01 至 M-06 六个接口均写入本地数据库缓存，使系统在外部接口不可用时仍可运行，对应需求文档 NFR-U2；

（2）**安全**：A-01 至 A-06 与 D-01 至 D-14 均区分鉴权等级，对应 NFR-S2、NFR-S3；B-04 通过服务端校验重复投票，对应 NFR-S5；

（3）**可用性**：P-02 返回 `aiCommentSource` 字段显式暴露降级状态，对应 FR-17 与 NFR-P6；

（4）**性能**：R-02 聚合首页数据，减少首屏请求次数，对应 NFR-P1；全部列表接口支持分页，对应 NFR-P3。

（5）**跨歌手比较**：B-01 的 `multi-artist` 模式允许最多 6 位歌手的专辑进入同一对决池，恢复"不同歌手放在一起比"的核心玩法，对应 FR-26 与 US-03；

（6）**数据准确性**：M-01 的地区参数与相关性校验，以及 B-01 的七条专辑准入规则，共同对应 NFR-D1 至 NFR-D5。其中地区参数不得使用 `cn`、检索结果必须做相关性校验、专辑归属必须按标识而非名称比对，这三条均由实测发现，详见 4.1 与 5.1 节的说明。
