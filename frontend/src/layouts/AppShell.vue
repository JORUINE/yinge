<template>
  <div class="shell">
    <header class="topbar">
      <div class="container bar">
        <RouterLink to="/" class="logo">
          音格<span class="dot">.</span>
        </RouterLink>

        <nav class="nav">
          <RouterLink to="/battle/create">专辑对决</RouterLink>
          <RouterLink to="/personality/test">人格测评</RouterLink>
          <RouterLink to="/rank">排行榜</RouterLink>
          <RouterLink to="/personality/types">人格图鉴</RouterLink>
        </nav>

        <div class="right">
          <template v-if="auth.isLoggedIn">
            <RouterLink to="/profile" class="who">{{ auth.nickname }}</RouterLink>
            <el-button size="small" text @click="onLogout">退出</el-button>
          </template>
          <RouterLink v-else to="/login">
            <el-button type="primary" size="small">登录 / 注册</el-button>
          </RouterLink>
        </div>
      </div>
    </header>

    <main class="main">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>

    <footer class="foot">
      <div class="container muted">
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
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { registerAuthHandlers } from '@/api/client';

const auth = useAuthStore();
const router = useRouter();

const bannedVisible = ref(false);
const bannedReason = ref(null);
const bannedNote = ref(null);

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
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--header-h);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}

.bar {
  height: var(--header-h);
  display: flex;
  align-items: center;
  gap: var(--sp-5);
}

.logo {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.03em;
  color: var(--text-1);
}

.logo .dot {
  color: var(--accent);
}

.nav {
  display: flex;
  gap: var(--sp-5);
  margin-left: var(--sp-5);
}

.nav a {
  color: var(--text-2);
  font-size: var(--fs-sm);
  transition: color var(--dur-fast) var(--ease-out);
}

.nav a:hover,
.nav a.router-link-active {
  color: var(--brand-deep);
}

.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.who {
  color: var(--text-1);
  font-size: var(--fs-sm);
}

.main {
  flex: 1;
}

.foot {
  border-top: 1px solid var(--border);
  padding: var(--sp-5) 0;
  font-size: var(--fs-xs);
}

.banned-line {
  margin-bottom: var(--sp-2);
  line-height: 1.7;
}

@media (max-width: 720px) {
  .nav {
    display: none;
  }
}
</style>
