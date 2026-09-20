<template>
  <div class="adminwrap">
    <div class="admbar">
      <button v-if="showBack" class="back" type="button" @click="goBack" title="返回看板">
        <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        <span>返回看板</span>
      </button>
      <span class="lg">音<i>格</i> · 管理后台</span>
      <span class="sp">
        <RouterLink to="/" class="backsite">返回前台</RouterLink>
        {{ auth.nickname || '管理员' }}
        <button class="mini" type="button" @click="logout">退出</button>
      </span>
    </div>

    <div class="adm">
      <nav class="admnav">
        <div class="tt">数据</div>
        <RouterLink to="/admin" active-class="noop" exact-active-class="on">数据看板</RouterLink>
        <div class="sep"></div>
        <div class="tt">内容</div>
        <RouterLink to="/admin/questions" active-class="noop" exact-active-class="on">题目管理</RouterLink>
        <RouterLink to="/admin/types" active-class="noop" exact-active-class="on">人格类型</RouterLink>
        <RouterLink to="/admin/music" active-class="noop" exact-active-class="on">音乐数据</RouterLink>
        <RouterLink to="/admin/combos" active-class="noop" exact-active-class="on">歌手组合</RouterLink>
        <div class="sep"></div>
        <div class="tt">用户</div>
        <RouterLink to="/admin/users" active-class="noop" exact-active-class="on">用户管理</RouterLink>
      </nav>

      <div class="admmain">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

/** 后台二级页（看板以外的四页）也补返回 —— 守则 21 要求"含后台" */
const showBack = computed(() => route.name !== 'admin-dashboard');

function goBack() {
  if (window.history.state?.back) router.back();
  else router.push({ name: 'admin-dashboard' });
}

async function logout() {
  await auth.logout();
  router.push({ name: 'admin-login' });
}
</script>

<style scoped>
/* 后台自带 chrome，页面外壳（AppShell 顶栏）在 /admin 下不渲染 */
.adminwrap {
  padding: 22px 0 60px;
}
.admbar {
  border: 1px solid var(--gbd);
  border-bottom: 0;
  border-radius: var(--r) var(--r) 0 0;
  background: var(--glass);
}
.adm {
  margin-top: 0;
}
.mini {
  margin-left: 8px;
}
.backsite {
  margin-right: 10px;
  font-size: 13.5px;
  color: var(--brand-deep);
  text-decoration: none;
}
.backsite:hover {
  text-decoration: underline;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 5px 11px 5px 7px;
  border-radius: 999px;
  border: 1px solid var(--gbd);
  background: var(--glass2);
  color: var(--text2);
  font-size: 13.5px;
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
</style>
