/**
 * 接口封装：按接口文档的分组组织，路径与方法一一对应。
 * 调用方拿到的直接是 data，无需再解包 code。
 */
import { http } from './client.js';

export const authApi = {
  register: (data) => http.post('/auth/register', data),
  login: (data) => http.post('/auth/login', data),
  me: () => http.get('/auth/me'),
  logout: () => http.post('/auth/logout'),
  updateProfile: (data) => http.put('/users/me', data),
  myStats: () => http.get('/users/me/stats'),
};

export const musicApi = {
  searchArtists: (params) => http.get('/music/artists/search', { params }),
  getArtist: (artistId) => http.get(`/music/artists/${artistId}`),
  listArtistAlbums: (artistId, params) => http.get(`/music/artists/${artistId}/albums`, { params }),
  getAlbum: (albumId) => http.get(`/music/albums/${albumId}`),
  listAlbumTracks: (albumId, params) => http.get(`/music/albums/${albumId}/tracks`, { params }),
  getAlbumPreview: (albumId) => http.get(`/music/albums/${albumId}/preview`),
  listGenres: () => http.get('/music/genres'),
};

export const battleApi = {
  create: (data) => http.post('/battles', data),
  detail: (id) => http.get(`/battles/${id}`),
  nextMatch: (id) => http.get(`/battles/${id}/next-match`),
  vote: (id, matchId, albumId) => http.post(`/battles/${id}/matches/${matchId}/vote`, { albumId }),
  revival: (id) => http.post(`/battles/${id}/revival`),
  result: (id) => http.get(`/battles/${id}/result`),
  listMine: (params) => http.get('/battles', { params }),
  remove: (id) => http.delete(`/battles/${id}`),
};

export const personalityApi = {
  questions: () => http.get('/personality/questions'),
  submit: (answers) => http.post('/personality/submit', { answers }),
  result: (id) => http.get(`/personality/results/${id}`),
  listMine: (params) => http.get('/personality/results', { params }),
  types: () => http.get('/personality/types'),
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

export const rankApi = {
  albums: (params) => http.get('/rank/albums', { params }),
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
  listUsers: (params) => http.get('/admin/users', { params }),
  updateUserStatus: (id, data) => http.put(`/admin/users/${id}/status`, data),
};
