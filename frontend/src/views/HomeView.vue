<template>
  <div class="home">
    <div class="hero">
      <div>
        <div class="tag">本周精选 · 跨歌手混战</div>
        <h1>你的最爱专辑<br /><em>由你亲手决出</em></h1>
        <p>选几位歌手，把他们的专辑放进同一个擂台，两两对决、逐轮投票，最后生成一张夺冠之路。</p>
        <div class="btns">
          <RouterLink to="/battle/create" class="btn pri">
            <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            开始对决
          </RouterLink>
          <RouterLink to="/personality/test" class="btn blue">
            <svg class="ico" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3l2.1 5.4L20 9.3l-4 3.9.9 5.8L12 16.3 7.1 19l.9-5.8-4-3.9 5.9-.9z" />
            </svg>
            测音乐人格
          </RouterLink>
        </div>
      </div>
      <div class="art" :class="{ empty: !heroAlbum }">
        <img v-if="heroAlbum" :src="heroAlbum.artworkUrl" :alt="heroAlbum.name" />
        <span v-else class="artfallback">音格</span>
      </div>
    </div>

    <div class="duo">
      <RouterLink to="/battle/create" class="tile sea">
        <div class="ring"></div>
        <h3>专辑对决</h3>
        <p>单歌手 / 多歌手混战 · 自选规模 · 小组赛选 2 晋级 + 遗珠复活 + 1v1 淘汰</p>
        <span class="btn">开始对决</span>
      </RouterLink>
      <RouterLink to="/personality/test" class="tile ghost">
        <div class="ring"></div>
        <h3>音乐人格</h3>
        <p>12 道题，含 2 道听感题</p>
        <span class="btn ghost">去测一测</span>
      </RouterLink>
    </div>

    <div class="shelf" v-if="top.length">
      <div class="hd">
        <b>正在被投票的专辑</b>
        <span>按有效票数排序 · <RouterLink to="/rank">查看全部</RouterLink></span>
      </div>
      <div class="covers">
        <div v-for="a in top" :key="a.albumId" class="cv" @click="$router.push('/rank')">
          <div class="art"><img :src="a.artworkUrl" :alt="a.name" loading="lazy" /></div>
          <b>{{ a.name }}</b>
          <span>{{ a.artistName || '—' }}</span>
        </div>
      </div>
    </div>

    <div class="list" v-if="top.length">
      <div v-for="(a, i) in top.slice(0, 3)" :key="a.albumId" class="r">
        <div class="nw" :class="{ hot: i === 0 }">{{ i + 1 }}</div>
        <div class="th"><img :src="a.artworkUrl" :alt="a.name" /></div>
        <div class="m">
          <b>{{ a.name }}</b>
          <span>{{ a.artistName || '—' }} · {{ year(a.releaseDate) }}</span>
        </div>
        <div class="v"><b class="num">{{ a.votes ?? 0 }}</b> 票</div>
      </div>
    </div>

    <p v-else class="note">
      榜单还没有数据 —— 发起第一场对决，每投一票都会汇进这里。
    </p>

    <div class="panel" style="border-left: 3px solid var(--gold)">
      <h4>投票规范 · 花一分钟看一眼</h4>
      <p class="ps">榜单的可信度靠大家一起维护，以下行为会被系统记录并分级处理</p>
      <div class="rules">
        <div class="obrow">
          <span class="ic" style="background: rgba(13, 148, 136, 0.14)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <span class="tx"><b>同一场次只能投一票</b><span>重复提交会被接口拒绝，提示"你已投过这场"</span></span>
        </div>
        <div class="obrow">
          <span class="ic" style="background: rgba(224, 135, 0, 0.15)">
            <svg viewBox="0 0 24 24"><path d="M11 15h2v2h-2zm0-8h2v6h-2zm1-5a10 10 0 100 20 10 10 0 000-20z" /></svg>
          </span>
          <span class="tx"><b>别用极快速度连点</b><span>间隔过短会被判为异常并拦截</span></span>
        </div>
        <div class="obrow">
          <span class="ic" style="background: rgba(220, 38, 38, 0.13)">
            <svg viewBox="0 0 24 24">
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zM4 12a8 8 0 0113.7-5.6L6.4 17.7A7.9 7.9 0 014 12zm14.4 3.3L7.7 4.9A8 8 0 0118.4 15.3z" />
            </svg>
          </span>
          <span class="tx"><b>不要注册多个账号刷票</b><span>同一设备或 IP 批量投票会被标记</span></span>
        </div>
        <div class="obrow">
          <span class="ic" style="background: rgba(14, 165, 233, 0.13)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 3l7 4v6c0 4.4-3 8-7 8s-7-3.6-7-8V7z" />
            </svg>
          </span>
          <span class="tx"><b>先警告，多次才禁用</b><span>累计警告自动停权；数据保留，可申诉</span></span>
        </div>
      </div>
      <p class="fine">
        被判定为异常的投票<b>不计入榜单与人格分布统计</b>，所以刷票既改变不了结果，还会让你失去账号。
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { rankApi } from '@/api';

const top = ref([]);
const heroAlbum = computed(() => top.value[0] || null);
const year = (d) => (d ? String(d).slice(0, 4) : '');

onMounted(async () => {
  try {
    const data = await rankApi.albums({ limit: 5 });
    top.value = data.list || [];
  } catch (err) {
    ElMessage.error(err?.message || '榜单加载失败');
  }
});
</script>

<style scoped>
.home {
  padding-bottom: var(--sp-7);
}
.btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.art.empty {
  background: linear-gradient(150deg, #7dd3fc, #0ea5e9 58%, #0369a1);
  display: grid;
  place-items: center;
}
.artfallback {
  font-size: 40px;
  font-weight: 700;
  color: #04263c;
  letter-spacing: -1px;
}
.tile {
  display: block;
  text-decoration: none;
  color: inherit;
}
.rules {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.fine {
  margin: 16px 0 0;
  font-size: 12px;
  color: var(--text3);
  line-height: 1.75;
}
.fine b {
  color: var(--text2);
}
@media (max-width: 860px) {
  .hero {
    grid-template-columns: 1fr;
  }
  .hero .art {
    max-width: 320px;
  }
  .duo {
    grid-template-columns: 1fr;
  }
  .covers {
    grid-template-columns: repeat(3, 1fr);
  }
  .rules {
    grid-template-columns: 1fr;
  }
}
</style>
