<template>
  <div class="auth">
    <div class="authwrap">
      <div class="side-txt">
        <h2>登录后<br /><em>你的选择才留得下</em></h2>
        <p>对决记录、测评结果、收藏的专辑，都会存进你的账号。下次打开就能接着投票。</p>
        <div class="feat">
          <span>保存对决记录</span><span>回看人格卡</span><span>收藏专辑</span><span>参与排行榜</span>
        </div>
      </div>

      <div class="g-card">
        <div class="seg">
          <button type="button" :class="{ on: !isRegister }" @click="isRegister = false">登录</button>
          <button type="button" :class="{ on: isRegister }" @click="isRegister = true">注册</button>
        </div>

        <div class="fld">
          <label>账号</label>
          <input
            v-model="form.account"
            type="text"
            placeholder="4 至 20 位字母、数字或下划线"
            autocomplete="username"
            @keyup.enter="onSubmit"
          />
        </div>

        <div v-if="isRegister" class="fld">
          <label>昵称</label>
          <input v-model="form.nickname" type="text" placeholder="2 至 16 个字，需唯一" />
        </div>

        <div class="fld">
          <label>密码</label>
          <input
            v-model="form.password"
            type="password"
            placeholder="6 至 32 位"
            autocomplete="current-password"
            @keyup.enter="onSubmit"
          />
          <div class="hint">密码经单向加密存储，数据库不保留明文</div>
        </div>

        <button class="btn pri wide" type="button" :disabled="loading" @click="onSubmit">
          {{ loading ? '请稍候…' : isRegister ? '注册并进入' : '登录' }}
        </button>

        <div class="authfoot">
          {{ isRegister ? '已经有账号了？' : '还没有账号？' }}
          <a @click="isRegister = !isRegister">{{ isRegister ? '去登录' : '立即注册' }}</a>
        </div>
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

async function onSubmit() {
  if (!form.account.trim() || !form.password) {
    ElMessage.info('请填写账号与密码');
    return;
  }
  loading.value = true;
  try {
    if (isRegister.value) await auth.register({ ...form, account: form.account.trim() });
    else await auth.login({ account: form.account.trim(), password: form.password });
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
.auth {
  padding-bottom: var(--sp-7);
}
.g-card {
  padding: 26px 28px;
}
.authfoot a {
  cursor: pointer;
}
@media (max-width: 860px) {
  .authwrap {
    grid-template-columns: 1fr;
    padding: 20px 0;
  }
}
</style>
