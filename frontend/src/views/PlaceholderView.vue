<template>
  <div class="container narrow">
    <div class="card panel">
      <p class="eyebrow">{{ route.meta.title || '页面' }}</p>
      <h1>{{ route.meta.title || '此页面' }}</h1>
      <p class="muted">
        该页面已在原型（19 页）中定稿，当前为前端骨架的占位视图，将随页面开发逐步替换为正式实现。
      </p>
      <div class="actions">
        <RouterLink to="/"><el-button>返回首页</el-button></RouterLink>
        <RouterLink to="/battle/create"><el-button type="primary">去创建对决</el-button></RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<style scoped>
.narrow {
  max-width: 620px;
  padding-top: var(--sp-7);
  padding-bottom: var(--sp-8);
}

.panel {
  padding: var(--sp-6);
}

.eyebrow {
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand);
  margin-bottom: var(--sp-2);
}

p.muted {
  margin-top: var(--sp-3);
}

.actions {
  margin-top: var(--sp-5);
  display: flex;
  gap: var(--sp-3);
}
</style>
