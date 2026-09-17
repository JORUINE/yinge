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
        <nav class="nav-inline">
          <RouterLink to="/" class="logo">音<i>格</i></RouterLink>
          <RouterLink to="/battle/create" active-class="on">专辑对决</RouterLink>
          <RouterLink to="/personality" active-class="on">音乐人格</RouterLink>
          <RouterLink to="/rank" active-class="on">排行榜</RouterLink>
          <RouterLink to="/personality/types" active-class="on">人格图鉴</RouterLink>
          <RouterLink v-if="auth.isLoggedIn" to="/battle/mine" active-class="on">我的对决</RouterLink>
        </nav>

        <div class="right">
          <template v-if="auth.isLoggedIn">
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
import { registerAuthHandlers } from '@/api/client';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

/** 后台自带 chrome：/admin 下不渲染站点顶栏与页脚 */
const isAdmin = computed(() => route.path.startsWith('/admin'));

const bannedVisible = ref(false);
const bannedReason = ref(null);
const bannedNote = ref(null);

const avatarChar = computed(() => (auth.nickname || '音').slice(0, 1));

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
