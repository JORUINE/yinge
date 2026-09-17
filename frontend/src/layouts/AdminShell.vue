<template>
  <div class="adminwrap">
    <div class="admbar">
      <span class="lg">音<i>格</i> · 管理后台</span>
      <span class="sp">
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
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

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
</style>
