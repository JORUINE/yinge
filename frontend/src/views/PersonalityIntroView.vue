<template>
  <div class="intro">
    <div class="qintro">
      <div>
        <span class="hero-tag">MUSIC PERSONALITY · 音乐人格</span>
        <h2>你的音乐口味<br /><em>是一种什么样的人格</em></h2>
        <!-- ⚠️ 2026-10-21 第五十八批：这里原来硬编码「12 道题，其中两题…」，
             而下面的事实胶囊是**从接口取的**（20 道 / 4 道听感），同一屏自相矛盾。
             现在一律用同一个来源（questionCount / audioCount），改口径只改一处。 -->
        <p>
          {{ questionCount }} 道题，其中 {{ audioCount }} 道需要先听一段音乐再作答。答完会得到一张可分享的人格卡，
          以及一段针对你个人作答生成的解读——不是所有人共用的模板。
        </p>
        <div class="qfacts">
          <span>{{ questionCount }} 道题</span>
          <span>含 {{ audioCount }} 道听感题</span>
          <span>约 3 分钟</span>
          <span>{{ types.length || 6 }} 种人格类型</span>
        </div>
        <div class="btns">
          <RouterLink to="/personality/test" class="btn pri">
            <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            开始测评
          </RouterLink>
          <RouterLink to="/personality/types" class="btn ghost">先看看有哪些人格</RouterLink>
        </div>

        <!-- 众包入口（2026-09-20 新增）：用户给专辑归类 → 票数高的进对应人格的推荐池 -->
        <div class="tagcall">
          <div class="tagcall-tx">
            <b>顺手做件小事？</b>
            <span>看一张专辑，选它更像哪一型 —— 30 秒一票。票数高的专辑会被采纳进对应人格的「常听专辑」。</span>
          </div>
          <RouterLink to="/personality/tag-albums" class="btn sm">去投一票</RouterLink>
        </div>
      </div>

      <!-- ⭐ 2026-10-05 改：右侧六型预览以前是一条彩色竖线 + 两行字，跟"人格卡"没有视觉关系。
           现在每格做成一张迷你卡：左边压一张该型**卡面缩略图**（与人格卡同源素材），
           名字用该型品牌色（六个色全部 ≥4.6 对比，见 tokens.css）。 -->
      <div class="typesprev">
        <div
          v-for="t in types"
          :key="t.code"
          class="tpv"
          :style="{
            '--tc': typeColor(t.code),
            '--tc-rgb': typeColorRgb(t.code),
            '--tcf': typeColorFill(t.code),
            '--tcf-rgb': typeColorFillRgb(t.code),
          }"
          @click="$router.push({ name: 'personality-type', params: { code: t.code } })"
        >
          <span class="tpvface" :style="{ backgroundImage: thumb(t.code) }"></span>
          <span class="tpvtx">
            <b>{{ t.name }}</b>
            <i>{{ t.description }}</i>
          </span>
        </div>
      </div>
    </div>

    <!-- ⚠️ 2026-10-21 第五十八批：这里原来是一段**写给开发者看的设计说明**
         （"入口页把三件事讲清楚…文案特意点明…"），直接露在用户面前。
         改成作者真正想说的话：希望大家在这里遇到没听过的专辑和音乐。 -->
    <p class="note">
      <b>一点私心：</b>做这个模块，除了想让你看清自己的音乐口味，<b>更希望你能在这里遇到几首、几张平时不会主动点开的专辑</b>。
      测完往下翻，会给你一批「你可能没听过、但和你很合」的唱片 —— 挑一张放完它，
      说不定就是这次测评里最有价值的收获。
    </p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';
import { typeColor, typeColorRgb, typeColorFill, typeColorFillRgb } from '@/utils/personality.js';
import { QUIZ_FACTS } from '@/utils/personalityFacts.js';

const types = ref([]);
// 兜底值与真实抽题规则同源（接口拿到真实值后会被覆盖）
const questionCount = ref(QUIZ_FACTS.total);
const audioCount = ref(QUIZ_FACTS.audio);

const shortDesc = (d, n = 16) => (d && d.length > n ? d.slice(0, n) + '…' : d || '');
/** 该型卡面缩略图（人格卡同源素材，288×384） */
const thumb = (code) => `url(/img/personality/th-${String(code || '').toUpperCase()}.jpg)`;

onMounted(async () => {
  try {
    const [t, q] = await Promise.all([personalityApi.types(), personalityApi.questions()]);
    types.value = (t.list || []).map((x) => ({ ...x, description: shortDesc(x.description) }));
    const list = q.list || [];
    if (list.length) {
      questionCount.value = list.length;
      audioCount.value = list.filter((x) => x.type === 'audio').length;
    }
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  }
});
</script>

<style scoped>
.intro {
  padding-bottom: var(--sp-6);
}
.hero-tag {
  display: inline-block;
  font-size: 13px;
  letter-spacing: 1.3px;
  color: var(--brand-deep);
  font-weight: 700;
  background: rgba(14, 165, 233, 0.14);
  padding: 4px 12px;
  border-radius: 999px;
  margin-bottom: 14px;
}
.btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
/* 平板及以下（≤1024）：测评首页改单列（原 860） */
@media (max-width: 1024px) {
  .qintro {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 众包入口条（2026-09-20）：不抢主按钮风头，但一眼能看到 */
.tagcall {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding: 13px 16px;
  border-radius: 14px;
  background: linear-gradient(120deg, rgba(14, 165, 233, 0.1), rgba(13, 148, 136, 0.1));
  border: 1px dashed rgba(14, 165, 233, 0.45);
}
.tagcall-tx b { display: block; font-size: 15px; }
.tagcall-tx span { display: block; margin-top: 3px; font-size: 13px; line-height: 1.6; color: var(--text2); max-width: 520px; }
</style>
