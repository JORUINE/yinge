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
        <!-- 娱乐声明（2026-09-22 用户："人格测试那里也要加上一个告示，娱乐为主，不要当真"）
             ⚠️ 放在**答题之前**看到的位置，不是藏在页脚 —— 这是心理学测评的伦理底线：
                任何非临床的量表都不能被当成诊断，界面必须说出来。 -->
        <div class="funnotice">
          <b>娱乐向测评 · 别当真</b>
          <span>
            这是一套<b>娱乐性质</b>的音乐偏好小测验，不是心理诊断，也不能用来定义你是谁。
            音乐是很多元、很情绪化的东西 —— 同一个人今天和明天可能测得不一样，这很正常。
            把它当成"我最近偏哪一口"的小游戏就好。
          </span>
        </div>

        <!-- 续答提示：只在恢复成功时出现 -->
        <div v-if="resumed" class="resumenote">
          <b>接着上次继续</b>
          <span>已经答到第 {{ idx + 1 }} 题（共 {{ questions.length }} 题），之前的选择都还在。</span>
          <button class="mini" type="button" @click="restart">重新开始</button>
        </div>

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
              :class="{ on: answers[current.questionId] === o.key, neutral: o.neutral }"
              @click="pick(o.key)"
            >
              <!-- 展示用字母（服务端每次乱序后给的 displayKey）；提交仍用原始 key -->
              <span class="k">{{ o.displayKey || o.key }}</span>
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
import { saveQuizProgress, loadQuizProgress, clearQuizProgress } from '@/utils/quizResume.js';

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
/** 本次这一套题的 id（续答要一起存，否则刷新后抽到的是另一套题） */
const qids = ref([]);
/** 本次是不是"接着上次继续"进来的（只为给用户一句提示） */
const resumed = ref(false);

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
  persist();
  // 选完稍等片刻自动进下一题（最后一题不自动提交）
  if (!isLast.value) {
    setTimeout(() => {
      if (answers[current.value.questionId] === key) next();
    }, 220);
  }
}

function prev() {
  if (idx.value > 0) {
    idx.value -= 1;
    persist();
  }
}

/** 把"这套题 + 已选答案 + 当前第几题"写进 localStorage（刷新/误退后能接着答） */
function persist() {
  if (!qids.value.length) return;
  saveQuizProgress({ qids: qids.value, answers: { ...answers }, idx: idx.value });
}

/** 重新开始：清掉本地进度、把答案与进度归零，然后重新抽一套题 */
async function restart() {
  clearQuizProgress();
  resumed.value = false;
  // ⚠️ 2026-09-22 自检抓到的真 bug：只清 localStorage 是不够的 ——
  //    idx 与 answers 还留在内存里，点完"重新开始"页面仍停在第 5 题（用户会以为没生效）。
  idx.value = 0;
  Object.keys(answers).forEach((k) => delete answers[k]);
  await load();
  ElMessage.success('已重新开始');
}

async function next() {
  if (!answers[current.value.questionId]) {
    ElMessage.info('先选一个答案');
    return;
  }
  if (!isLast.value) {
    idx.value += 1;
    persist();
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
    clearQuizProgress(); // 答完就清，免得下次进来又"接着上次继续"
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

/**
 * 取题（支持续答）
 * ------------------------------------------------------------
 * 2026-09-22 用户："我做一半不小心按到刷新或者退出，重进就要重头来，这个问题要优化。"
 * 流程：① 先看本地有没有未完成的进度；
 *      ② 有 → 按它记住的**题目 id 列表**让服务端取回**同一套题**（题目是随机抽的，
 *         不按 id 取回就会换一套，答案全部作废）；
 *      ③ 把答案与"当前第几题"填回去，并提示用户"接着上次继续"。
 */
async function load() {
  loading.value = true;
  try {
    const saved = loadQuizProgress();
    const data = await personalityApi.questions(saved?.qids);
    questions.value = data.list || [];
    qids.value = data.meta?.qids || questions.value.map((q) => q.questionId);
    poolSize.value = data.meta?.poolSize || questions.value.length;
    audioCount.value = data.meta?.audio || questions.value.filter((q) => q.type === 'audio').length;

    // 恢复答案与进度（只有服务端确认是"同一套题"时才有意义：
    // 若 qids 对不上，data.meta.resumed 会是 false，这时留着旧答案反而会答错题）
    if (saved && data.meta?.resumed) {
      Object.keys(answers).forEach((k) => delete answers[k]);
      Object.assign(answers, saved.answers || {});
      idx.value = Math.min(Math.max(0, saved.idx || 0), questions.value.length - 1);
      resumed.value = true;
      ElMessage.success(`接着上次继续 · 已答 ${Object.keys(saved.answers || {}).length} 题`);
    } else {
      resumed.value = false;
      if (saved) clearQuizProgress(); // 题库变了/过期 → 旧进度已经没用，清掉
      // 没有可恢复的进度 → 内存里的旧答案/旧位置也要清（否则会串到新一套题上）
      idx.value = 0;
      Object.keys(answers).forEach((k) => delete answers[k]);
    }
    if (questions.value.length) {
      const q = questions.value[idx.value] || questions.value[0];
      audioSrc.value = q.type === 'audio' ? audioOf(q) : '';
    }
    persist();
  } catch (err) {
    ElMessage.error(err?.message || '题目加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(load);
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

/* 娱乐声明 + 续答提示 + 中立选项（2026-09-22） */
.funnotice {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: baseline;
  max-width: 720px;
  margin: 0 auto 14px;
  padding: 13px 18px;
  border-radius: 12px;
  border: 1px solid rgba(245, 158, 11, 0.34);
  background: linear-gradient(100deg, rgba(245, 158, 11, 0.1), var(--glass2) 62%);
}
.funnotice b {
  flex: 0 0 auto;
  font-size: 14.5px;
  color: #b45309;
}
html[data-theme='dark'] .funnotice b {
  color: #fcd34d;
}
.funnotice span {
  flex: 1 1 300px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text2);
}
.resumenote {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  max-width: 720px;
  margin: 0 auto 14px;
  padding: 11px 18px;
  border-radius: 12px;
  border: 1px solid rgba(14, 165, 233, 0.34);
  background: rgba(14, 165, 233, 0.08);
}
.resumenote b {
  font-size: 14.5px;
}
.resumenote span {
  flex: 1 1 220px;
  min-width: 0;
  font-size: 13px;
  color: var(--text2);
}
/* 中立出口选项（"说不上来，没什么感觉"）：视觉上比其它选项轻一档，暗示"这不是偏好" */
.oi.neutral {
  border-style: dashed;
  opacity: 0.88;
}
.oi.neutral .k {
  background: var(--glass2);
  color: var(--text3);
}
</style>
