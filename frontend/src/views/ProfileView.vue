<template>
  <div class="container narrow">
    <section class="card hero">
      <div class="who">
        <div class="avatar">{{ initial }}</div>
        <div>
          <h1>{{ user?.nickname || '未登录' }}</h1>
          <p class="muted num">账号 {{ user?.account }} · 注册于 {{ fmtDate(user?.createdAt) }}</p>
          <el-tag v-if="user?.role === 'admin'" type="danger" size="small" effect="plain">管理员</el-tag>
        </div>
      </div>
    </section>

    <section class="stats">
      <div v-for="s in statsItems" :key="s.label" class="card stat">
        <strong class="num">{{ display(s.value) }}</strong>
        <span class="muted">{{ s.label }}</span>
      </div>
    </section>

    <section class="card editor">
      <p class="eyebrow">修改资料</p>
      <h2>昵称</h2>
      <el-form :model="form" :rules="rules" ref="formRef" inline @submit.prevent>
        <el-form-item prop="nickname">
          <el-input v-model="form.nickname" placeholder="给自己起个响亮的名字" maxlength="20" style="width: 260px" />
        </el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </el-form>
    </section>

    <section class="links">
      <RouterLink to="/battle/mine"><el-button>我的对决</el-button></RouterLink>
      <RouterLink to="/favorites"><el-button>我的收藏</el-button></RouterLink>
      <RouterLink to="/personality/types"><el-button>人格图鉴</el-button></RouterLink>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { authApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { fmtDate } from '@/utils/labels';

const auth = useAuthStore();
const user = computed(() => auth.user);
const initial = computed(() => (user.value?.nickname || '?').slice(0, 1).toUpperCase());

const stats = ref({ battleTotal: 0, battleFinished: 0, resultTotal: 0, favoriteTotal: 0, voteTotal: 0 });
const statsItems = computed(() => [
  { label: '发起对决', value: stats.value.battleTotal },
  { label: '已完成', value: stats.value.battleFinished },
  { label: '测评次数', value: stats.value.resultTotal },
  { label: '收藏', value: stats.value.favoriteTotal },
  { label: '投票数', value: stats.value.voteTotal },
]);
function display(v) {
  return Number.isFinite(v) ? v : '—';
}

const form = reactive({ nickname: '' });
const formRef = ref(null);
const saving = ref(false);
const rules = {
  nickname: [{ required: true, message: '昵称不能为空', trigger: 'blur' }],
};

onMounted(async () => {
  form.nickname = user.value?.nickname || '';
  try {
    stats.value = await authApi.myStats();
  } catch (err) {
    ElMessage.error(err?.message || '加载统计失败');
  }
});

async function save() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  saving.value = true;
  try {
    const data = await authApi.updateProfile({ nickname: form.nickname.trim() });
    auth.user = data;
    ElMessage.success('昵称已更新');
  } catch (err) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.narrow {
  max-width: 860px;
  padding-top: var(--sp-7);
  padding-bottom: var(--sp-8);
}
.hero {
  padding: var(--sp-6);
  margin-bottom: var(--sp-5);
}
.who {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
}
.avatar {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--brand), var(--brand-deep));
  color: #fff;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 30px;
  flex-shrink: 0;
}
.who h1 {
  font-size: var(--fs-h1);
}
.who .muted {
  margin: var(--sp-1) 0 var(--sp-2);
  font-size: var(--fs-sm);
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
}
.stat {
  padding: var(--sp-5);
  text-align: center;
}
.stat strong {
  display: block;
  font-size: var(--fs-display);
  color: var(--brand-deep);
  line-height: 1.1;
}
.stat span {
  font-size: var(--fs-sm);
}
.editor {
  padding: var(--sp-6);
  margin-bottom: var(--sp-5);
}
.eyebrow {
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand);
}
.editor h2 {
  font-size: var(--fs-h2);
  margin: var(--sp-2) 0 var(--sp-4);
}
.links {
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
</style>
