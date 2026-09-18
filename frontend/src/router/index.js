/**
 * 路由
 * ------------------------------------------------------------
 * 覆盖原型 19 页；已实现的页面指向真实视图，其余先指向占位视图，
 * 随页面开发逐步替换（占位视图会显示该页在原型中的定位）。
 */
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const Placeholder = () => import('@/views/PlaceholderView.vue');

const routes = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '首页' } },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录 / 注册' } },

  { path: '/battle/create', name: 'battle-create', component: () => import('@/views/BattleCreateView.vue'), meta: { title: '创建对决', requiresAuth: true } },
  { path: '/battle/mine', name: 'battle-mine', component: () => import('@/views/BattleMineView.vue'), meta: { title: '我的对决', requiresAuth: true } },
  { path: '/battle/:id', name: 'battle-play', component: () => import('@/views/BattlePlayView.vue'), meta: { title: '对决进行中', requiresAuth: true } },
  { path: '/battle/:id/bracket', name: 'battle-bracket', component: () => import('@/views/BattleBracketView.vue'), meta: { title: '对决对阵表', requiresAuth: true } },
  { path: '/battle/:id/result', name: 'battle-result', component: () => import('@/views/BattleResultView.vue'), meta: { title: '对决结果与夺冠之路', requiresAuth: true } },
  { path: '/battle/:id/share', name: 'battle-share', component: () => import('@/views/BattleShareView.vue'), meta: { title: '夺冠之路分享图', requiresAuth: true } },

  { path: '/personality', name: 'personality-intro', component: () => import('@/views/PersonalityIntroView.vue'), meta: { title: '音乐人格测评' } },
  { path: '/personality/test', name: 'personality-test', component: () => import('@/views/PersonalityTestView.vue'), meta: { title: '开始测评' } },
  { path: '/personality/result/:id', name: 'personality-result', component: () => import('@/views/PersonalityResultView.vue'), meta: { title: '人格卡', requiresAuth: true } },
  { path: '/personality/types', name: 'personality-types', component: () => import('@/views/PersonalityTypesView.vue'), meta: { title: '人格图鉴' } },
  { path: '/personality/types/:code', name: 'personality-type', component: () => import('@/views/PersonalityTypeView.vue'), meta: { title: '类型详情' } },

  { path: '/rank', name: 'rank', component: () => import('@/views/RankView.vue'), meta: { title: '全球最受欢迎专辑榜' } },
  { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { title: '个人中心', requiresAuth: true } },
  { path: '/favorites', name: 'favorites', component: () => import('@/views/FavoritesView.vue'), meta: { title: '我的收藏', requiresAuth: true } },

  { path: '/admin/login', name: 'admin-login', component: () => import('@/views/admin/AdminLoginView.vue'), meta: { title: '后台登录' } },
  { path: '/admin', name: 'admin-dashboard', component: () => import('@/views/admin/AdminDashboardView.vue'), meta: { title: '后台总览', requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/questions', name: 'admin-questions', component: () => import('@/views/admin/AdminQuestionsView.vue'), meta: { title: '题目管理', requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/types', name: 'admin-types', component: () => import('@/views/admin/AdminTypesView.vue'), meta: { title: '人格类型管理', requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/music', name: 'admin-music', component: () => import('@/views/admin/AdminMusicView.vue'), meta: { title: '音乐数据管理', requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/combos', name: 'admin-combos', component: () => import('@/views/admin/AdminCombosView.vue'), meta: { title: '歌手组合管理', requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/users', name: 'admin-users', component: () => import('@/views/admin/AdminUsersView.vue'), meta: { title: '用户管理', requiresAuth: true, requiresAdmin: true } },

  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { title: '页面不存在' } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded && auth.token) await auth.fetchMe();

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    // 免注册可玩（需求文档）：不弹登录，自动领一个游客身份继续玩。
    // 游客数据只存本机浏览器；收藏等仍要求正式注册（FavoriteButton 会拦）。
    try {
      await auth.ensureGuest();
    } catch {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'home' };
  }
  document.title = to.meta.title ? `${to.meta.title} · 音格` : '音格 · 专辑对决与音乐人格测评';
  return true;
});

export default router;
