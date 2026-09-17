<template>
  <div class="intro">
    <div class="qintro">
      <div>
        <span class="hero-tag">MUSIC PERSONALITY · 音乐人格</span>
        <h2>你的音乐口味<br /><em>是一种什么样的人格</em></h2>
        <p>
          12 道题，其中两题需要先听一段音乐再作答。答完会得到一张可分享的人格卡，
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
      </div>

      <div class="typesprev">
        <div
          v-for="t in types"
          :key="t.code"
          class="tpv"
          :style="{ '--tc': typeColor(t.code) }"
          @click="$router.push({ name: 'personality-type', params: { code: t.code } })"
        >
          <b>{{ t.name }}</b>
          <span>{{ t.description }}</span>
        </div>
      </div>
    </div>

    <p class="note">
      <b>说明：</b>入口页把三件事讲清楚 —— <b>要做多少题、要花多久、做完能拿到什么</b>。
      右侧先把各人格亮出来，让用户有预期。文案特意点明"含两题要先听音乐"，
      因为这是音乐测评与普通问卷最本质的区别。
    </p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';
import { typeColor } from '@/utils/personality.js';

const types = ref([]);
const questionCount = ref(12);
const audioCount = ref(2);

const shortDesc = (d, n = 16) => (d && d.length > n ? d.slice(0, n) + '…' : d || '');

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
  font-size: 12px;
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
@media (max-width: 860px) {
  .qintro {
    grid-template-columns: 1fr;
  }
}
</style>
