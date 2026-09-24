/**
 * 接口封装：按接口文档的分组组织，路径与方法一一对应。
 * 调用方拿到的直接是 data，无需再解包 code。
 */
import { http } from './client.js';

export const authApi = {
  register: (data) => http.post('/auth/register', data),
  login: (data) => http.post('/auth/login', data),
  guest: () => http.post('/auth/guest'),
  me: () => http.get('/auth/me'),
  logout: () => http.post('/auth/logout'),
  updateProfile: (data) => http.put('/users/me', data),
  myStats: () => http.get('/users/me/stats'),
  // A-07 游客数据迁移：注册 / 登录后把本机游客账号的对决转进当前账号
  claimGuest: (guestId) => http.post('/users/me/claim-guest', { guestId }),
};

export const musicApi = {
  searchArtists: (params) => http.get('/music/artists/search', { params }),
  /** 批量补歌手本人照片（搜索结果先秒回，真图随后异步补上） */
  artistPhotos: (ids) => http.get('/music/artists/photos', { params: { ids: ids.join(',') } }),
  getArtist: (artistId) => http.get(`/music/artists/${artistId}`),
  listArtistAlbums: (artistId, params) => http.get(`/music/artists/${artistId}/albums`, { params }),
  getAlbum: (albumId) => http.get(`/music/albums/${albumId}`),
  listAlbumTracks: (albumId, params) => http.get(`/music/albums/${albumId}/tracks`, { params }),
  getAlbumPreview: (albumId) => http.get(`/music/albums/${albumId}/preview`),
  listGenres: () => http.get('/music/genres'),
  /** 按流派去 Apple Music 找靠前的歌手（只读，不写库） */
  discoverGenreArtists: (params) => http.get('/music/genres/discover', { params }),
  /** 本地曲库搜专辑（后台绑「人格推荐专辑」用，只查本地库、毫秒级） */
  searchAlbums: (params) => http.get('/music/albums/search', { params }),
  /** 白名单名单（瞬时返回，不打 iTunes）—— "点开就能看到这册里都有谁" */
  genreWhitelist: (params) => http.get('/music/genres/whitelist', { params }),
  /** 把发现的歌手同步进曲库（后端每批最多 8 位） */
  warmGenreArtists: (data) => http.post('/music/genres/warm', data),
  /** 年代模式专辑池补足（#84）：把区间内已知歌手整张碟同步进曲库 */
  eraBackfill: (data) => http.post('/music/era/backfill', data),
};

export const battleApi = {
  create: (data) => http.post('/battles', data),
  detail: (id) => http.get(`/battles/${id}`),
  nextMatch: (id) => http.get(`/battles/${id}/next-match`),
  // 新赛制（tournamentVersion=2）：统一下一步；小组/复活为一次多选 K 张晋级
  nextStep: (id) => http.get(`/battles/${id}/next-step`),
  groupVote: (id, groupId, pickedAlbumIds) =>
    http.post(`/battles/${id}/groups/${groupId}/vote`, { pickedAlbumIds }),
  vote: (id, matchId, albumId) => http.post(`/battles/${id}/matches/${matchId}/vote`, { albumId }),
  revival: (id) => http.post(`/battles/${id}/revival`),
  // 撤销上一步投票（把由此推进出来的场次一起退回）
  undo: (id) => http.post(`/battles/${id}/undo`),
  result: (id) => http.get(`/battles/${id}/result`),
  listMine: (params) => http.get('/battles', { params }),
  remove: (id) => http.delete(`/battles/${id}`),
  // ---- 好友一起玩（同款签表）----
  /** 生成 / 取回我这局的邀请码 */
  invite: (id) => http.post(`/battles/${id}/invite`),
  /** 查看同款签表（好友点开链接看到的介绍） */
  inviteInfo: (code) => http.get(`/battles/join/${code}`),
  /** 接龙开局：用同一批专辑开一局自己的 */
  joinInvite: (code) => http.post(`/battles/join/${code}`),
  /** 对比：冠军是否一致 / 从第几步开始分歧 */
  inviteCompare: (code) => http.get(`/battles/join/${code}/compare`),
};

export const personalityApi = {
  // qids：续答时传上一次那套题的 id（刷新/误退后接着答）
  questions: (qids) => http.get('/personality/questions', { params: qids?.length ? { qids: qids.join(',') } : {} }),
  submit: (answers) => http.post('/personality/submit', { answers }),
  result: (id) => http.get(`/personality/results/${id}`),
  listMine: (params) => http.get('/personality/results', { params }),
  types: () => http.get('/personality/types'),
  /** 专辑归类投票（众包）：下一张 / 投票 / 聚合统计 */
  nextTagAlbum: () => http.get('/personality/album-tags/next'),
  voteTag: (data) => http.post('/personality/album-tags', data),
  tagStats: (params) => http.get('/personality/album-tags/stats', { params }),
  typeDetail: (code) => http.get(`/personality/types/${code}`),
  stats: () => http.get('/personality/stats'),
};

export const favoriteApi = {
  add: (data) => http.post('/favorites', data),
  remove: (targetId) => http.delete(`/favorites/${targetId}`),
  list: (params) => http.get('/favorites', { params }),
};

export const shareCardApi = {
  add: (data) => http.post('/share-cards', data),
  list: (params) => http.get('/share-cards', { params }),
};

export const comboApi = {
  // 我能看到的组合 = 系统组合（管理员维护）+ 我自建的
  list: () => http.get('/combos'),
  create: (data) => http.post('/combos', data),
  update: (id, data) => http.put(`/combos/${id}`, data),
  remove: (id) => http.delete(`/combos/${id}`),
  /** 后台：用户喜爱的 PK 组合榜（按真实开过的局数排） */
  popular: (params) => http.get('/combos/popular', { params }),
};

export const rankApi = {
  albums: (params) => http.get('/rank/albums', { params }),
  /** 专辑「夺冠次数」榜（2026-09-19 新增） */
  champions: (params) => http.get('/rank/champions', { params }),
  home: () => http.get('/rank/home'),
};

export const adminApi = {
  login: (data) => http.post('/admin/login', data),
  dashboard: () => http.get('/admin/dashboard'),
  listQuestions: () => http.get('/admin/questions'),
  createQuestion: (data) => http.post('/admin/questions', data),
  updateQuestion: (id, data) => http.put(`/admin/questions/${id}`, data),
  deleteQuestion: (id) => http.delete(`/admin/questions/${id}`),
  listTypes: () => http.get('/admin/types'),
  createType: (data) => http.post('/admin/types', data),
  updateType: (id, data) => http.put(`/admin/types/${id}`, data),
  deleteType: (id) => http.delete(`/admin/types/${id}`),
  listMusic: (params) => http.get('/admin/music', { params }),
  refreshMusic: (artistId) => http.post('/admin/music/refresh', { artistId }),
  // 按流派手动加歌手（2026-09-24 第十七批）：搜音乐源 → 专辑入库 → 记录流派归属
  addGenreArtist: (data) => http.post('/admin/genre-artists', data),
  listGenreArtists: (params) => http.get('/admin/genre-artists', { params }),
  listUsers: (params) => http.get('/admin/users', { params }),
  updateUserStatus: (id, data) => http.put(`/admin/users/${id}/status`, data),
};
