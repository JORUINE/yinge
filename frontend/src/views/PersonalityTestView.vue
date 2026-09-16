<template>
  <div class="container narrow">
    <div class="page-head">
      <p class="eyebrow">音乐人格测评</p>
      <h1>12 道题，测出你的音乐人格</h1>
      <p class="muted">含 2 道听感题。答完会得到一张人格卡，以及一段个性化解读和三张推荐专辑。</p>
    </div>

    <div v-if="loading" class="muted">正在加载题目…</div>

    <template v-else>
      <article v-for="(q, index) in questions" :key="q.questionId" class="card block">
        <div class="qhead">
          <span class="qno num">{{ String(index + 1).padStart(2, '0') }}</span>
          <h3>{{ q.title }}</h3>
          <el-tag v-if="q.type === 'audio'" size="small" type="warning">听感题</el-tag>
        </div>
        <el-radio-group v-model="answers[q.questionId]" class="opts">
          <el-radio v-for="o in q.options" :key="o.key" :value="o.key" border>{{ o.label }}</el-radio>
        </el-radio-group>
      </article>

      <div class="submitbar">
        <span class="muted small">已答 <strong class="num">{{ answeredCount }} / {{ questions.length }}</strong></span>
        <el-button type="primary" size="large" :loading="submitting" @click="onSubmit">提交，看结果</el-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const submitting = ref(false);
const questions = ref([]);
const answers = reactive({});

const answeredCount = computed(() => Object.values(answers).filter(Boolean).length);

onMounted(async () => {
  try {
    const data = await personalityApi.questions();
    questions.value = data.list || [];
  } catch (err) {
    ElMessage.error(err?.message || '题目加载失败');
  } finally {
    loading.value = false;
  }
});

async function onSubmit() {
  if (answeredCount.value < questions.value.length) {
    ElMessage.warning('请答完全部题目再提交');
    return;
  }
  if (!auth.isLoggedIn) {
    ElMessage.info('登录后才能保存结果');
    router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
    return;
  }
  submitting.value = true;
  try {
    const payload = questions.value.map((q) => ({ questionId: q.questionId, optionKey: answers[q.questionId] }));
    const result = await personalityApi.submit(payload);
    router.push({ name: 'personality-result', params: { id: result.resultId } });
  } catch (err) {
    ElMessage.error(err?.message || '提交失败');
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.narrow {
  max-width: 720px;
}

.block {
  padding: var(--sp-5);
  margin-bottom: var(--sp-4);
}

.qhead {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}

.qno {
  color: var(--brand);
  font-size: var(--fs-sm);
}

.qhead h3 {
  flex: 1;
}

.opts {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: stretch;
}

.opts :deep(.el-radio) {
  margin-right: 0;
  height: auto;
  padding: var(--sp-3) var(--sp-4);
}

.submitbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--sp-8);
  gap: var(--sp-4);
  flex-wrap: wrap;
}

.small {
  font-size: var(--fs-sm);
}
</style>
