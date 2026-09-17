<template>
  <div class="adminlogin">
    <div class="g-card">
      <p class="eyebrow">后台管理</p>
      <h1>管理员登录</h1>
      <p class="sub">仅限管理员账号。普通用户账号无法进入。</p>

      <div class="fld">
        <label>账号</label>
        <input v-model="form.account" type="text" placeholder="管理员账号" autocomplete="username" />
      </div>
      <div class="fld">
        <label>密码</label>
        <input
          v-model="form.password"
          type="password"
          placeholder="密码"
          autocomplete="current-password"
          @keyup.enter="onLogin"
        />
      </div>

      <button class="btn pri wide" type="button" :disabled="loading" @click="onLogin">
        {{ loading ? '登录中…' : '登录' }}
      </button>

      <div class="authfoot">
        <RouterLink to="/">← 回前台</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { adminApi } from '@/api';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const form = reactive({ account: '', password: '' });

async function onLogin() {
  if (!form.account.trim() || !form.password) {
    ElMessage.info('请填写账号与密码');
    return;
  }
  loading.value = true;
  try {
    const data = await adminApi.login({ account: form.account.trim(), password: form.password });
    auth.applySession(data);
    ElMessage.success('登录成功');
    router.push({ name: 'admin-dashboard' });
  } catch (err) {
    ElMessage.error(err?.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.adminlogin {
  max-width: 420px;
  margin: 0 auto;
  padding: 60px 0 80px;
}
.g-card {
  padding: 28px 30px;
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 1.4px;
  font-weight: 800;
  color: var(--brand-deep);
  text-transform: uppercase;
  margin: 0;
}
h1 {
  font-size: 26px;
  margin: 6px 0 4px;
  letter-spacing: -0.6px;
}
.sub {
  font-size: 13px;
  color: var(--text2);
  margin: 0 0 20px;
}
.authfoot {
  margin-top: 14px;
}
</style>
