<template>
  <!-- 极光背景：与设计稿 .aurora 一致，fixed 铺满、内容在其上 -->
  <div class="aurora" aria-hidden="true">
    <div class="blob b1"></div>
    <div class="blob b2"></div>
    <div class="blob b3"></div>
    <div class="ray r1"></div>
    <div class="ray r2"></div>
  </div>

  <div class="shell">
    <header v-if="!isAdmin" class="topbar">
      <div class="container bar">
        <button v-if="showBack" class="back" type="button" @click="goBack" title="返回">
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
          <span>返回</span>
        </button>
        <nav class="nav-inline">
          <RouterLink to="/" class="logo">音<i>格</i></RouterLink>
          <RouterLink to="/battle/create" active-class="on">专辑对决</RouterLink>
          <RouterLink to="/personality" active-class="on">音乐人格</RouterLink>
          <RouterLink to="/rank" active-class="on">排行榜</RouterLink>
          <RouterLink to="/personality/types" active-class="on">人格图鉴</RouterLink>
          <RouterLink v-if="auth.isLoggedIn" to="/battle/mine" active-class="on">我的对决</RouterLink>
          <RouterLink v-if="auth.isLoggedIn" to="/favorites" active-class="on">我的收藏</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin" active-class="on">管理后台</RouterLink>
        </nav>

        <div class="right">
          <template v-if="auth.isLoggedIn">
            <RouterLink
              v-if="auth.isGuest"
              to="/login"
              class="guest-tag"
              title="游客身份：对决数据只保存在本机浏览器，注册后才能收藏与长期保留"
            >
              游客 · 注册
            </RouterLink>
            <RouterLink to="/profile" class="me" :title="auth.nickname || '个人中心'">
              {{ avatarChar }}
            </RouterLink>
            <a class="quit" @click="onLogout">退出</a>
          </template>
          <RouterLink v-else to="/login" class="btn pri sm">登录 / 注册</RouterLink>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="container">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </div>
    </main>

    <footer v-if="!isAdmin" class="foot">
      <div class="container">
        音格 · 专辑对决与音乐人格测评　|　试听与封面数据来自 iTunes Search API（免登录，30 秒片段）
      </div>
    </footer>

    <el-dialog v-model="bannedVisible" title="账号已被禁用" width="420px" align-center>
      <p class="banned-line">
        你的账号当前处于禁用状态，暂时无法登录与投票。数据仍完整保留。
      </p>
      <p v-if="bannedReason" class="banned-line">
        <strong>禁用原因：</strong>{{ reasonText(bannedReason) }}
      </p>
      <p v-if="bannedNote" class="banned-line"><strong>判定说明：</strong>{{ bannedNote }}</p>
      <template #footer>
        <el-button @click="bannedVisible = false">我知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useFavoritesStore } from '@/stores/favorites';
import { registerAuthHandlers } from '@/api/client';

const auth = useAuthStore();
const fav = useFavoritesStore();
const router = useRouter();
const route = useRoute();

/** 后台自带 chrome：/admin 下不渲染站点顶栏与页脚 */
const isAdmin = computed(() => route.path.startsWith('/admin'));

const bannedVisible = ref(false);
const bannedReason = ref(null);
const bannedNote = ref(null);

const avatarChar = computed(() => (auth.nickname || '音').slice(0, 1));

/**
 * 全站返回按钮（守则 21：各个层级界面都没有返回按钮）
 * ------------------------------------------------------------
 * 二级 / 三级页才显示。有上一页历史 → 真回退一步；
 * 没有历史（比如直接粘贴链接进来）→ 退回逻辑父路由，避免"点了没反应"。
 */
const BACK_FALLBACK = {
  'battle-play': { name: 'battle-mine' },
  'battle-bracket': { name: 'battle-mine' },
  'battle-result': { name: 'battle-mine' },
  'battle-share': { name: 'battle-mine' },
  'personality-test': { name: 'personality-intro' },
  'personality-result': { name: 'personality-intro' },
  'personality-type': { name: 'personality-types' },
  'admin-login': { name: 'home' },
};
const showBack = computed(() => Boolean(BACK_FALLBACK[route.name]));

function goBack() {
  if (window.history.state?.back) router.back();
  else router.push(BACK_FALLBACK[route.name] || { name: 'home' });
}

const REASON_TEXT = {
  vote_fraud: '刷票行为',
  spam_content: '昵称或账号名含违规内容',
  abuse_request: '绕过前端高频调用接口',
  self_request: '用户本人申请注销',
  appeal_overturned: '误判申诉成立',
};

function reasonText(code) {
  return REASON_TEXT[code] || code;
}

onMounted(() => {
  registerAuthHandlers({
    onUnauthorized: () => {
      auth.clear();
      fav.reset();
      router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
    },
    onBanned: (detail) => {
      bannedReason.value = detail?.bannedReason || null;
      bannedNote.value = detail?.bannedNote || null;
      bannedVisible.value = true;
      auth.clear();
    },
  });
  if (auth.token) auth.fetchMe();
});

async function onLogout() {
  await auth.logout();
  fav.reset();
  router.push({ name: 'home' });
}
</script>

<style scoped>
.shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--glass);
  backdrop-filter: blur(22px) saturate(180%);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  border-bottom: 1px solid var(--gbd);
}

.bar {
  height: var(--header-h);
  display: flex;
  align-items: center;
  gap: var(--sp-5);
}

/* 全站返回按钮（守则 21）：只在二级 / 三级页出现 */
.back {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  padding: 5px 11px 5px 7px;
  border-radius: 999px;
  border: 1px solid var(--gbd);
  background: var(--glass2);
  color: var(--text2);
  font-size: 12.5px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.back:hover {
  color: var(--brand-deep);
  border-color: var(--brand);
}
.back svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 与设计稿 .nav 一致：左 logo + 链接，右头像 */
.nav-inline {
  display: flex;
  align-items: center;
  gap: 22px;
}

.logo {
  font-weight: 700;
  font-size: 17px;
  color: var(--text);
}
.logo i {
  color: var(--brand);
  font-style: normal;
}

.nav-inline a {
  font-size: 13.5px;
  color: var(--text2);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}
.nav-inline a:hover {
  color: var(--brand-deep);
}
.nav-inline a.on {
  color: var(--text);
  font-weight: 600;
}

.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.me {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--brand-ink);
  background: var(--brand);
  cursor: pointer;
}

.quit {
  font-size: 13px;
  color: var(--text2);
  cursor: pointer;
  transition: color 0.2s;
}
.quit:hover {
  color: var(--brand-deep);
}

/* 游客身份标识：点去注册（需求口径——玩可以免注册，收藏/长期保留要注册） */
.guest-tag {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--brand-deep);
  background: rgba(14, 165, 233, 0.12);
  border: 1px dashed rgba(14, 165, 233, 0.5);
  border-radius: 999px;
  padding: 3px 10px;
  text-decoration: none;
  white-space: nowrap;
}
.guest-tag:hover {
  background: rgba(14, 165, 233, 0.2);
}

.main {
  flex: 1;
  padding: 26px 0 40px;
}

.foot {
  border-top: 1px solid var(--line);
  padding: var(--sp-5) 0;
  font-size: var(--fs-xs);
  color: var(--text3);
}

.banned-line {
  margin-bottom: var(--sp-2);
  line-height: 1.7;
}

@media (max-width: 760px) {
  .nav-inline a:not(.logo) {
    display: none;
  }
}
</style>
