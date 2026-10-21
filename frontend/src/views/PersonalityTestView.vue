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
              <!-- ⚠️ 2026-10-18 第四十六批：已选加一个明确的对勾。
                   用户原话："有时候点击了进入下一道题 但是选项已经被选择了" ——
                   回退到答过的题时，旧答案仍在（这是"允许回退修改"的设计），
                   但界面上只有一个淡淡的底色，用户看不出"这是我之前选的"，
                   于是以为"选项莫名其妙被选了"。一个 ✓ 就把状态说清了。 -->
              <svg v-if="answers[current.questionId] === o.key" class="picked" viewBox="0 0 24 24" aria-label="已选"><path d="M9 16.2l-3.5-3.5L4 14.2 9 19.2 20 8.2 18.6 6.8z" /></svg>
            </div>
          </div>

          <div class="qnav">
            <button class="btn ghost" type="button" :disabled="idx === 0" @click="prev">上一题</button>
            <!-- ⚠️ 2026-10-18 第四十六批：「下一题」从实心蓝(pri)降级为描边(ghost)。
                 用户原话："下一题有蓝色方框 导致用户会注意力更容易分散到上面 产生误判操作" ——
                 实心蓝按钮和选项卡视觉重量相同，用户会把它当成"要选的答案"。
                 现在选项是视觉主角，按钮退为导航；已答时给一个轻提示告诉他可以下一题了。 -->
            <button class="btn ghost qnext" type="button" :disabled="submitting" @click="next">
              <template v-if="isLast">{{ submitting ? '提交中…' : '提交，看结果' }}</template>
              <template v-else-if="answers[current.questionId]">下一题 →</template>
              <template v-else>选一个答案</template>
            </button>
          </div>
          <p v-if="answers[current.questionId]" class="qnav-hint">
            已选「{{ pickedLabel }}」
            <span class="qnav-hint-x">· 选错了？点它一下就能取消，也可以直接点别的选项</span>
            <!-- 真·撤销按钮：把这一题的答案清掉，并取消自动跳题 -->
            <button class="undo-pick" type="button" @click="undoPick">撤销</button>
          </p>
        </div>
      </div>

      <!-- ⚠️ 2026-10-21 第五十八批：这里原来是一段**写给开发者看的设计说明**
           （"答题页的关键是不让人中途放弃…"），直接露在用户面前。
           改成面向答题的人：怎么选、怎么撤、别纠结、放轻松。 -->
      <div class="playtip">
        <b>怎么答？很简单</b>
        <ul>
          <li><b>直接点选项就算选上了</b>，不用再点确认。</li>
          <li><b>选错了可以撤销</b>：再点一下那个选项，或点下面的「撤销」；也可以直接改点别的。</li>
          <li><b>不用纠结</b> —— 这里没有正确答案，也不考你懂不懂乐理。</li>
          <li><b>跟着第一感觉走</b>，越放松越准。就当是一次发现新专辑的小散步，开心最重要。</li>
        </ul>
      </div>
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

/** 当前题已选项的文案（用于"已选「X」· 点选项可改选"那行提示） */
const pickedLabel = computed(() => {
  const key = answers[current.value?.questionId];
  if (!key) return '';
  return current.value?.options?.find((o) => o.key === key)?.label || '';
});

/**
 * 自动跳转的防重入令牌（2026-10-18 第四十六批）
 * 每次 pick 自增；setTimeout 回调里只有"令牌没变"才执行跳转，
 * 避免自动跳转与手动「下一题」叠加导致一次跳两题。
 */
const pickToken = ref(0);

/** 听感题的音频：兼容几种可能的字段名，拿不到就提示"待配置" */
function audioOf(q) {
  return q?.audioUrl || q?.previewUrl || q?.audio || q?.sampleUrl || '';
}

watch(current, (q) => {
  audioSrc.value = q?.type === 'audio' ? audioOf(q) : '';
  playing.value = false;
});

/**
 * 用户"没选却被选上"的防护（2026-10-21 第五十八批）
 * ------------------------------------------------------------
 * 用户原话：「我还没选择，点了后进入下一题，如图他就自己选上 e 了，容易让用户误会」。
 * 机制：自动跳题是"选完 220ms 后"发生的，但**手指的第二下点击**会落在**已经换好的下一题**上，
 * 于是那道新题就被"凭空"选上了（用户完全没意识到自己点过）。
 * 对策：① 换题后的 `GHOST_MS` 内忽略选项点击（幽灵点击）；
 *      ② 再点一次**已选中**的选项 = 撤销选择（用户"不满意可以撤销"）。
 */
const GHOST_MS = 420;
let lastNavAt = 0;

function markNav() {
  lastNavAt = Date.now();
}

/** 撤销这一题的选择（用户"不满意可以撤销"）：清答案 + 掐掉还在等的那次自动跳题 */
function undoPick() {
  const qid = current.value.questionId;
  if (!qid) return;
  delete answers[qid];
  pickToken.value += 1;
  persist();
}

function pick(key) {
  // ① 刚换过题：这一下很可能是上一题的"余震"，忽略掉（并且不弹任何提示，避免用户困惑）
  if (Date.now() - lastNavAt < GHOST_MS) return;
  const qid = current.value.questionId;
  // ② 再点已选中的那一项 = 撤销（用户要的"不满意可以撤销"）
  if (answers[qid] === key) {
    delete answers[qid];
    persist();
    pickToken.value += 1; // 取消掉可能还在等的那次自动跳题
    return;
  }
  answers[qid] = key;
  persist();
  // 选完稍等片刻自动进下一题（最后一题不自动提交）
  // ⚠️ 2026-10-18 第四十六批：修自动跳转与手动「下一题」的竞态。
  //   旧写法用 setTimeout + 闭包比对 answers，用户在 220ms 内又点了「下一题」时，
  //   idx 已前进，闭包里那句 `answers[current.questionId] === key` 仍可能成立
  //   ⇒ 再触发一次 next()，一次点击跳两题，落到已答过的题上
  //   ⇒ 用户看到"选项已经被选择了"（实测复现的 bug）。
  //   修法：给这次点击发一个递增 token，回调里只有 token 仍是当前这次的才跳。 */
  const token = (pickToken.value += 1);
  if (!isLast.value) {
    // ⚠️ 从 220ms 放宽到 480ms：留一段"后悔窗口"，让「再点一次取消」真的用得上。
    //    太短（220）时人还没反应过来就已经跳走了，等于没有撤销。
    setTimeout(() => {
      if (token === pickToken.value && answers[current.value.questionId] === key) next();
    }, 480);
  }
}

function prev() {
  if (idx.value > 0) {
    idx.value -= 1;
    markNav();
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
    markNav();
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

/* ═══════════════════════════════════════════════════════════════════════
 * 2026-10-18 第四十六批：答题页三项可读性/防误触修正
 * ---------------------------------------------------------------------
 * 用户真机反馈三条：
 *   ① "下一题有蓝色方框 导致用户会注意力更容易分散到上面 产生误判操作"
 *      ⇒ 实心蓝按钮与选项卡视觉重量相同。把「下一题」降为描边按钮，
 *        选项重新成为视觉主角；已答时按钮文案变"下一题 →"给轻推动。
 *   ② "有时候点击了进入下一道题 但是选项已经被选择了"
 *      ⇒ 回退到答过的题时旧答案仍在（"允许回退修改"是设计），但界面上只有一个淡底色，
 *        用户看不出"这是我之前选的"。补一个 ✓ 徽标 + 一行"已选「X」· 点选项可改选"。
 *   ③ "用户要完整的看到题目和上一题下一题按钮 就看不到进度条"
 *      ⇒ 进度条 qbar 压紧凑（点变小、行高收紧），把垂直空间让给题目与按钮。
 * ═══════════════════════════════════════════════════════════════════════ */
/* ① 已选徽标：右下角一个实心小勾，不占文字位 */
.oi {
  position: relative;
}
.oi .picked {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  fill: var(--brand);
  pointer-events: none;
}
/* ② 导航按钮：下一题退为描边，不再和选项抢注意力 */
.qnav .btn.qnext {
  border: 1.5px solid var(--gbd);
  background: var(--glass2);
  color: var(--text);
  font-weight: 700;
}
.qnav .btn.qnext:disabled {
  opacity: 0.55;
}
.qnav-hint {
  margin: 8px 2px 0;
  font-size: 12.5px;
  color: var(--text2);
  text-align: center;
}
.qnav-hint b {
  color: var(--brand-deep);
}
.qnav-hint-x {
  color: var(--text3);
}
/* 撤销这一题（2026-10-21 第五十八批）：低对比但看得见、点得到（≥44 触控高） */
.undo-pick {
  margin-left: 10px;
  padding: 4px 12px;
  min-height: 30px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--brand-deep);
  background: rgba(14, 165, 233, 0.1);
  border: 1px solid rgba(14, 165, 233, 0.34);
  border-radius: 999px;
  cursor: pointer;
}
.undo-pick:active {
  background: rgba(14, 165, 233, 0.18);
}
/* 面向用户的答题提示（原来这里是一条写给开发者看的设计说明） */
.playtip {
  max-width: 720px;
  margin: 18px auto 0;
  padding: 14px 18px;
  border-radius: 14px;
  background: var(--glass2);
  border: 1px solid var(--line);
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text2);
}
.playtip > b {
  display: block;
  margin-bottom: 6px;
  font-size: 14.5px;
  color: var(--text);
}
.playtip ul {
  margin: 0;
  padding-left: 18px;
}
.playtip li {
  margin: 4px 0;
}
.playtip li b {
  color: var(--brand-deep);
}
/* ③ 进度条压紧凑：让题目 + 上一题/下一题能同屏 */
.qbar {
  margin-bottom: 12px;
}
.qbar .dots {
  gap: 4px;
}
.qbar .dots i {
  width: 6px;
  height: 6px;
}
.qbar .cnt {
  font-size: 12px;
}
/* 手机档再收一档：题目区与按钮之间别留太多空气 */
@media (max-width: 640px) {
  .qcard2 {
    padding: 16px 14px 18px;
  }
  .qcard2 h3 {
    font-size: 19px;
    line-height: 1.35;
  }
  .qnav {
    margin-top: 14px;
  }
  .qnav .btn {
    min-height: 46px;
  }
}
</style>
