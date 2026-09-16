<template>
  <div class="container narrow">
    <div class="card panel">
      <h1>{{ isRegister ? '注册音格' : '登录音格' }}</h1>
      <p class="muted sub">
        {{ isRegister ? '注册后即可开对决、存记录。' : '登录后你的对决与测评都会被保存。' }}
      </p>

      <el-form :model="form" label-position="top" @submit.prevent="onSubmit">
        <el-form-item label="账号">
          <el-input v-model="form.account" placeholder="4-20 位字母、数字或下划线" autocomplete="username" />
        </el-form-item>

        <el-form-item v-if="isRegister" label="昵称">
          <el-input v-model="form.nickname" placeholder="2-16 个字，需唯一" />
        </el-form-item>

        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="至少 6 位"
            autocomplete="current-password"
          />
        </el-form-item>

        <el-button type="primary" class="submit" :loading="loading" @click="onSubmit">
          {{ isRegister ? '注册并进入' : '登录' }}
        </el-button>
      </el-form>

      <div class="switch">
        <span class="muted">{{ isRegister ? '已经有账号了？' : '还没有账号？' }}</span>
        <el-button text type="primary" @click="toggle">{{ isRegister ? '去登录' : '去注册' }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const isRegister = ref(false);
const loading = ref(false);
const form = reactive({ account: '', password: '', nickname: '' });

function toggle() {
  isRegister.value = !isRegister.value;
}

async function onSubmit() {
  loading.value = true;
  try {
    if (isRegister.value) await auth.register({ ...form });
    else await auth.login({ account: form.account, password: form.password });
    ElMessage.success(isRegister.value ? '注册成功' : '登录成功');
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.replace(redirect);
  } catch (err) {
    ElMessage.error(err?.message || '操作失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.narrow {
  max-width: 460px;
  padding-top: var(--sp-7);
  padding-bottom: var(--sp-8);
}

.panel {
  padding: var(--sp-6);
}

h1 {
  margin-bottom: var(--sp-2);
}

.sub {
  margin-bottom: var(--sp-5);
  font-size: var(--fs-sm);
}

.submit {
  width: 100%;
  margin-top: var(--sp-2);
}

.switch {
  margin-top: var(--sp-4);
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-sm);
}
</style>
