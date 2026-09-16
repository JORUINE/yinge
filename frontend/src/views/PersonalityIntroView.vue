<template>
  <div class="container">
    <section class="hero">
      <p class="eyebrow rise">音乐人格测评</p>
      <h1 class="rise-2">你听歌的样子，<br />暴露了你是哪种人</h1>
      <p class="lede muted rise-3">
        12 道题（含 2 道听感题），测出你的音乐人格，<br />
        再给你一段专属解读，和 3 张为你挑的专辑。
      </p>
      <div class="cta rise-3">
        <RouterLink to="/personality/test">
          <el-button type="primary" size="large">开始测评</el-button>
        </RouterLink>
        <RouterLink to="/personality/types">
          <el-button size="large">逛人格图鉴</el-button>
        </RouterLink>
      </div>
    </section>

    <section class="grid">
      <article class="card entry">
        <h3>12 道精选题</h3>
        <p class="muted">覆盖听歌习惯、情绪、场景，不测智商，只测你与音乐的关系。</p>
      </article>
      <article class="card entry">
        <h3>含听感题</h3>
        <p class="muted">戴上耳机，凭耳朵而不是脑子选——这部分最能暴露本能偏好。</p>
      </article>
      <article class="card entry">
        <h3>AI 个性化解读</h3>
        <p class="muted">拿到人格卡后，系统结合你的得分生成解读，并推荐 3 张专辑。</p>
      </article>
    </section>

    <section v-if="types.length" class="preview">
      <h2>已有的人格类型</h2>
      <div class="chips">
        <RouterLink
          v-for="t in types"
          :key="t.code"
          :to="{ name: 'personality-type', params: { code: t.code } }"
          class="chip"
        >
          {{ t.name }}
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { personalityApi } from '@/api';

const types = ref([]);

onMounted(async () => {
  try {
    const data = await personalityApi.types();
    types.value = (data.list || []).slice(0, 12);
  } catch {
    /* 图鉴预览失败不影响主页 */
  }
});
</script>

<style scoped>
.hero {
  padding: var(--sp-8) 0 var(--sp-7);
  max-width: 760px;
}
.eyebrow {
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--brand);
  margin-bottom: var(--sp-4);
}
h1 {
  font-size: var(--fs-display);
  margin-bottom: var(--sp-5);
}
.lede {
  font-size: var(--fs-h3);
  line-height: 1.8;
}
.cta {
  margin-top: var(--sp-6);
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--sp-5);
  padding-bottom: var(--sp-7);
}
.entry {
  padding: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  transition: transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out);
}
.entry:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-2);
}
.entry h3 {
  font-size: var(--fs-h2);
}
.preview {
  padding-bottom: var(--sp-8);
}
.preview h2 {
  font-size: var(--fs-h2);
  margin-bottom: var(--sp-4);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.chip {
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-full);
  background: var(--brand-soft);
  color: var(--brand-deep);
  font-size: var(--fs-sm);
  transition: background var(--dur) var(--ease-out);
}
.chip:hover {
  background: var(--brand);
  color: #fff;
}
</style>
