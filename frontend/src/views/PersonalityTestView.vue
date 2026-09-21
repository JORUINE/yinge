<template>
  <div class="test">
    <div v-if="loading" class="state muted">正在加载题目…</div>

    <div v-else-if="!questions.length" class="state g-card">
      <h2>题目还没准备好</h2>
      <p class="muted">需要管理员先在后台导入题目。</p>
    </div>

    <template v-else>
      <div class="quizwrap">
        <!-- 2026-09-22：题库扩到 50 道、每次随机抽 20 道 —— 这件事必须告诉用户，
             否则"上次明明有 12 题这次怎么变了"会被当成 bug。 -->
        <div class="poolnote">
          <b>本次 {{ questions.length }} 题</b>
          <span>
            题库共 {{ poolSize }} 道，<b>每次随机抽题</b>，所以你和朋友测到的不会完全一样；
            其中 {{ audioCount }} 道是听感题（放 30 秒片段，凭第一反应答）。
          </span>
        </div>

        <div class="qbar">
          <div class="dots">
            <i
              v-for="(q, i) in questions"
              :key="q.questionId"
              :class="{ done: answers[q.questionId], cur: i === idx }"
            ></i>
          </div>
          <span class="cnt">第 {{ idx + 1 }} / {{ questions.length }} 题</span>
        </div>

        <div class="qcard2">
          <div class="qno">Q{{ idx + 1 }}<template v-if="current.type === 'audio'"> · 听感题</template></div>
          <h3>{{ current.title }}</h3>
          <p class="qtip">
            {{ current.type === 'audio' ? '先听，再答 —— 这是音乐测评与普通问卷的区别所在' : '凭第一直觉选就好，不用想太久' }}
          </p>

          <!-- 听感题：播放器嵌在题干下方 -->
          <div v-if="current.type === 'audio'" class="audioplay">
            <button class="bb" type="button" :disabled="!audioSrc" @click="togglePlay">
              <svg viewBox="0 0 24 24">
                <path v-if="playing" d="M6 5h4v14H6zM14 5h4v14h-4z" />
                <path v-else d="M8 5v14l11-7z" />
              </svg>
            </button>
            <span class="tx3">
              <b>测试片段 · 30 秒</b>
              <span>{{ audioSrc ? '听完再选择你的第一感觉 · 片段来自我们曲库，不告诉你是哪首' : '这段暂时取不到音频，凭题干直觉答也可以' }}</span>
            </span>
            <span class="wave"><i></i><i></i><i></i><i></i><i></i></span>
          </div>

          <div>
            <div
              v-for="o in current.options"
              :key="o.key"
              class="oi"
              :class="{ on: answers[current.questionId] === o.key }"
              @click="pick(o.key)"
            >
              <span class="k">{{ o.key }}</span>
              <span class="tx2">{{ o.label }}</span>
            </div>
          </div>

          <div class="qnav">
            <button class="btn ghost" type="button" :disabled="idx === 0" @click="prev">上一题</button>
            <button class="btn pri" type="button" :disabled="submitting" @click="next">
              {{ isLast ? (submitting ? '提交中…' : '提交，看结果') : '下一题' }}
            </button>
          </div>
        </div>
      </div>

      <p class="note">
        <b>说明：</b>答题页的关键是<b>不让人中途放弃</b>：① 顶部进度点，一眼知道还剩多少；
        ② 一屏只出一道题，答完自动进下一题；③ 听感题必须能播出来，播放器嵌在题干下方。
      </p>
    </template>

    <audio v-if="audioSrc" ref="audioEl" :src="audioSrc" @ended="playing = false"></audio>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const submitting = ref(false);
const questions = ref([]);
/** 题库元信息（总题量 / 听感题数）—— 接口里带回来的，用于上面那条说明 */
const poolSize = ref(0);
const audioCount = ref(0);
const answers = reactive({});
const idx = ref(0);

const audioEl = ref(null);
const playing = ref(false);
const audioSrc = ref('');

const current = computed(() => questions.value[idx.value] || {});
const isLast = computed(() => idx.value === questions.value.length - 1);
const answeredCount = computed(() => questions.value.filter((q) => answers[q.questionId]).length);

/** 听感题的音频：兼容几种可能的字段名，拿不到就提示"待配置" */
function audioOf(q) {
  return q?.audioUrl || q?.previewUrl || q?.audio || q?.sampleUrl || '';
}

watch(current, (q) => {
  audioSrc.value = q?.type === 'audio' ? audioOf(q) : '';
  playing.value = false;
});

function pick(key) {
  answers[current.value.questionId] = key;
  // 选完稍等片刻自动进下一题（最后一题不自动提交）
  if (!isLast.value) {
    setTimeout(() => {
      if (answers[current.value.questionId] === key) next();
    }, 220);
  }
}

function prev() {
  if (idx.value > 0) idx.value -= 1;
}

async function next() {
  if (!answers[current.value.questionId]) {
    ElMessage.info('先选一个答案');
    return;
  }
  if (!isLast.value) {
    idx.value += 1;
    return;
  }
  if (answeredCount.value < questions.value.length) {
    const firstUnanswered = questions.value.findIndex((q) => !answers[q.questionId]);
    idx.value = firstUnanswered;
    ElMessage.warning('还有题没答完');
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

function togglePlay() {
  const el = audioEl.value;
  if (!el) return;
  if (el.paused) {
    el.play?.().catch(() => {});
    playing.value = true;
    nextTick();
  } else {
    el.pause?.();
    playing.value = false;
  }
}

onMounted(async () => {
  try {
    const data = await personalityApi.questions();
    questions.value = data.list || [];
    poolSize.value = data.meta?.poolSize || questions.value.length;
    audioCount.value = data.meta?.audio || questions.value.filter((q) => q.type === 'audio').length;
    if (questions.value.length) audioSrc.value = questions.value[0].type === 'audio' ? audioOf(questions.value[0]) : '';
  } catch (err) {
    ElMessage.error(err?.message || '题目加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.test {
  padding-bottom: var(--sp-7);
}
.state {
  margin: var(--sp-8) auto;
  padding: var(--sp-6);
  max-width: 520px;
  text-align: center;
}

/* 题库说明条：告诉用户"本次多少题、是随机抽的" */
.poolnote {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0 auto 14px;
  padding: 10px 16px;
  max-width: 720px;
  border-radius: 12px;
  background: var(--glass2);
  border: 1px solid var(--line);
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text2);
}
.poolnote b {
  color: var(--text);
  white-space: nowrap;
}
</style>
