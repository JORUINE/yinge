<template>
  <div class="container narrow center">
    <p class="code num">404</p>
    <h1>这个页面不存在</h1>
    <p class="muted">链接可能已失效，或者地址写错了。</p>
    <RouterLink to="/"><el-button type="primary">回到首页</el-button></RouterLink>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 520px;
}

.center {
  padding: var(--sp-8) 0;
  text-align: center;
}

.code {
  font-size: 72px;
  color: var(--brand-soft);
  line-height: 1;
}

p.muted {
  margin: var(--sp-3) 0 var(--sp-5);
}
</style>
