<template>
  <div class="container">
    <section class="hero">
      <p class="eyebrow rise">专辑对决 · 音乐人格测评</p>
      <h1 class="rise-2">
        你最爱的那张专辑，<br />
        到底能不能打赢？
      </h1>
      <p class="lede muted rise-3">
        选歌手、按小组赛一路打到你心里的冠军；或者用 12 道题，测出你的音乐人格，<br />
        再看看它给你推荐哪三张专辑。
      </p>
      <div class="cta rise-3">
        <RouterLink to="/battle/create">
          <el-button type="primary" size="large">开始一场对决</el-button>
        </RouterLink>
        <RouterLink to="/personality/test">
          <el-button size="large">测音乐人格</el-button>
        </RouterLink>
      </div>
    </section>

    <section class="grid">
      <article class="card entry">
        <h3>专辑对决</h3>
        <p class="muted">
          五种范围模式，含"对位赛"——第 1 张打第 1 张。小组赛 + 淘汰赛，赛后生成夺冠之路。
        </p>
        <RouterLink to="/battle/create">去创建 →</RouterLink>
      </article>
      <article class="card entry">
        <h3>音乐人格</h3>
        <p class="muted">12 道题（含听感题），得出人格卡，并给出个性化解读与三张推荐专辑。</p>
        <RouterLink to="/personality/test">去测评 →</RouterLink>
      </article>
      <article class="card entry">
        <h3>排行榜</h3>
        <p class="muted">按全站有效票数排序，异常票不计入统计，榜单口径对所有人一致。</p>
        <RouterLink to="/rank">看榜单 →</RouterLink>
      </article>
    </section>
  </div>
</template>

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
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--sp-5);
  padding-bottom: var(--sp-8);
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
</style>
