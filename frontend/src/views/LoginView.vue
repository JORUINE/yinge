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
          <!-- ⚠️ 2026-10-17 第四十四批：placeholder 一打字就消失，用户根本没看见格式要求
               （用户原话："不知道是我账户名有空格还是什么情况"）⇒ 补一行常驻说明。
               ⚠️⚠️ 但这行**只能出现在手机档**：桌面端原本就有足够的空间与视觉层级，
               加一行会把登录卡撑高 26px —— 同输入 A/B 实测 15 项几何差异，违反
               "做手机适配不能影响桌面端"这条硬规则。所以桌面端 display:none。 -->
          <div v-if="isPhone" class="hint acct-hint">4-20 位字母、数字或下划线，<b>不能有空格和中文</b></div>
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
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { fieldErrorMessage, validateAuthForm } from '@/utils/fieldError';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const isRegister = ref(false);
const loading = ref(false);
const form = reactive({ account: '', password: '', nickname: '' });

/**
 * 是否手机档（≤640）—— 只用来决定"账号格式常驻说明"要不要显示。
 * ⚠️ 为什么用 JS 而不是纯 CSS：这行说明是**桌面端不渲染**的（v-if 而不是 display:none），
 *    否则同输入 A/B 会量到 15 项几何差异（实测踩过，2026-10-17 第四十四批）。
 */
const isPhone = ref(false);
let mqPhone = null;
onMounted(() => {
  mqPhone = window.matchMedia('(max-width: 640px)');
  isPhone.value = mqPhone.matches;
  mqPhone.addEventListener?.('change', (e) => { isPhone.value = e.matches; });
});
onBeforeUnmount(() => mqPhone?.removeEventListener?.('change', () => {}));

async function onSubmit() {
  if (!form.account.trim() || !form.password) {
    ElMessage.info('请填写账号与密码');
    return;
  }
  // ⚠️ 2026-10-17 第四十四批：先做前端预校验。
  //    以前直接打后端，用户等一个来回只看到"字段校验未通过"，不知道该改什么；
  //    现在提交前就拦住，且提示具体到"账号里不能有空格"这种程度。
  const localErr = validateAuthForm(
    { account: form.account, password: form.password, nickname: form.nickname },
    { isRegister: isRegister.value },
  );
  if (localErr) {
    ElMessage.warning(localErr);
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
    // ⚠️ 后端其实返了具体原因（err.data = [{field,message}]），以前只显示通用的 err.message
    ElMessage.error(fieldErrorMessage(err));
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
/* 平板及以下（≤1024）：登录/注册改单列（原 860） */
@media (max-width: 1024px) {
  .authwrap {
    grid-template-columns: minmax(0, 1fr);
    padding: 20px 0;
  }
}
</style>
