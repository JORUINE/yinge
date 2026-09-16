<template>
  <div class="container narrow">
    <div class="card panel">
      <p class="eyebrow">后台管理</p>
      <h1>管理员登录</h1>
      <p class="muted">仅限管理员账号。普通用户账号无法进入。</p>

      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" @submit.prevent>
        <el-form-item label="账号" prop="account">
          <el-input v-model="form.account" placeholder="管理员账号" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" show-password @keyup.enter="onLogin" />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" @click="onLogin" style="width: 100%">
          登录
        </el-button>
      </el-form>
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
const formRef = ref(null);
const loading = ref(false);
const form = reactive({ account: '', password: '' });
const rules = {
  account: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function onLogin() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
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
.narrow {
  max-width: 420px;
  padding-top: var(--sp-8);
  padding-bottom: var(--sp-8);
}
.panel {
  padding: var(--sp-6);
}
.eyebrow {
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand);
}
h1 {
  font-size: var(--fs-h1);
  margin: var(--sp-2) 0 var(--sp-2);
}
.muted {
  margin-bottom: var(--sp-5);
}
</style>
