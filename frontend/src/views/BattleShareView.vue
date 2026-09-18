<template>
  <div class="share">
    <div v-if="loading" class="state muted">正在加载…</div>

    <template v-else-if="champion">
      <div class="page-head">
        <p class="eyebrow">夺冠之路 · 分享图</p>
        <h1>把这次对决做成一张图</h1>
      </div>

      <div class="sharewrap">
        <div>
          <!-- 分享卡（导出对象） -->
          <div ref="cardEl" class="scard" :class="{ square: shape === 'square' }">
            <div>
              <div class="stop">音格 · YINGE.APP</div>
              <div class="stitle">我的专辑对决</div>
            </div>
            <div class="smain">
              <div class="crown">★ 冠 军 ★</div>
              <div class="art"><img :src="champion.artworkUrl" :alt="champion.name" crossorigin="anonymous" /></div>
              <div class="cname">{{ champion.name }}</div>
              <div class="cartist">{{ champion.artistName }} · {{ year(champion.releaseDate) }}</div>
              <div class="spath" v-if="opponents.length">
                <div v-for="(o, i) in opponents" :key="i">
                  <img :src="o.artworkUrl" :alt="o.name" crossorigin="anonymous" />
                </div>
              </div>
              <div class="roundline">{{ roundLine }}</div>
            </div>
            <div class="sfoot">
              <span>{{ footLine }}</span>
              <span v-if="withLink" class="sharel">{{ shareUrl }}</span>
            </div>
          </div>
          <p class="cap">预览效果 · 导出尺寸 {{ outSize }}</p>
        </div>

        <div>
          <div class="hd"><b>导出设置</b><span>选择后点下载即可保存到本地</span></div>
          <div class="opts">
            <div class="opt" :class="{ on: shape === 'portrait' }" @click="shape = 'portrait'">
              <span class="rd2"></span>
              <span class="tx"><b>竖版长图 1080 × 1440</b><span>适合发朋友圈、小红书、微博</span></span>
            </div>
            <div class="opt" :class="{ on: shape === 'square' }" @click="shape = 'square'">
              <span class="rd2"></span>
              <span class="tx"><b>方形图 1080 × 1080</b><span>适合发 Instagram、微博九宫格</span></span>
            </div>
            <div class="opt" :class="{ on: withLink }" @click="withLink = !withLink">
              <span class="rd2"></span>
              <span class="tx"><b>带上分享链接</b><span>把本场对决的链接印在图上，别人点开就能来投票</span></span>
            </div>
          </div>

          <div class="btns">
            <button class="btn pri" type="button" :disabled="exporting" @click="download">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 16V4M8 8l4-4 4 4M5 20h14" />
              </svg>
              {{ exporting ? '正在生成…' : '下载图片' }}
            </button>
            <button class="btn ghost" type="button" @click="copyLink">复制链接分享</button>
          </div>

          <div class="note">
            <b>说明：</b>分享图是作品的「自传播」出口 —— 前端把这张卡片转成图片下载（html2canvas），
            后端只记录一条分享记录用于「我的分享」找回。二维码留到部署后再接（需要线上域名才有意义）。
          </div>
        </div>
      </div>
    </template>

    <div v-else class="state g-card">
      <h2>冠军还没决出</h2>
      <p class="muted">先把对决投完，才能生成夺冠之路分享图。</p>
      <RouterLink :to="{ name: 'battle-play', params: { id } }" class="btn pri">继续投票</RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { battleApi } from '@/api';
import { ROUND_CN } from '@/utils/tournament.js';

const route = useRoute();
const id = route.params.id;

const loading = ref(true);
const exporting = ref(false);
const data = ref(null);
const cardEl = ref(null);

const shape = ref('portrait');
const withLink = ref(false);

const champion = computed(() => data.value?.champion || null);
const year = (d) => (d ? String(d).slice(0, 4) : '');
const shareUrl = computed(() => `${location.host}/battle/${id}`);

const opponents = computed(() =>
  (data.value?.path || []).map((p) => p.opponent).filter(Boolean).slice(0, 5),
);
const roundLine = computed(() => {
  const names = (data.value?.path || []).map((p) => ROUND_CN[p.roundName] || p.roundName);
  return names.length ? names.join(' → ') : '专辑对决';
});
const footLine = computed(() => {
  const b = data.value?.battle || {};
  const parts = [];
  if (b.poolTarget) parts.push(`${b.poolTarget} 张专辑`);
  if ((b.artists || []).length) parts.push(`${b.artists.length} 位歌手`);
  parts.push(`${b.stepTotal || 0} 场决出`);
  return parts.join(' · ');
});
const outSize = computed(() => (shape.value === 'square' ? '1080 × 1080' : '1080 × 1440'));

async function load() {
  loading.value = true;
  try {
    data.value = await battleApi.result(id);
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
    data.value = null;
  } finally {
    loading.value = false;
  }
}

async function download() {
  if (!cardEl.value) return;
  exporting.value = true;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const targetW = 1080;
    const scale = Math.max(2, targetW / cardEl.value.offsetWidth);
    const canvas = await html2canvas(cardEl.value, {
      scale,
      backgroundColor: null,
      useCORS: true,
      logging: false,
    });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `音格-夺冠之路-${champion.value?.name || '冠军'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    ElMessage.success('已保存到本地');
  } catch (err) {
    ElMessage.error('导出失败：' + (err?.message || '请稍后重试'));
  } finally {
    exporting.value = false;
  }
}

async function copyLink() {
  const url = `${location.origin}/battle/${id}`;
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success('链接已复制');
  } catch {
    ElMessage.info(url);
  }
}

onMounted(load);
</script>

<style scoped>
.share {
  padding-bottom: var(--sp-7);
}
.state {
  margin: var(--sp-8) auto;
  padding: var(--sp-6);
  max-width: 560px;
  text-align: center;
}
/* ⚠️ 原来 `.sharewrap` 在全局样式里**根本没定义** —— 两个子块退化成上下堆叠，
   分享卡被拉成整屏宽、3:4 的大块（用户："分享页面布局乱 / 拉这么长"）。
   这里补成「左卡右设置」两栏 + 两边距离约束（守则第 73 条）。 */
.sharewrap {
  display: grid;
  grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
  gap: 28px;
  align-items: start;
  max-width: 1120px;
  margin: 20px auto 0;
}
.sharewrap .scard {
  max-width: 420px;
}
@media (max-width: 900px) {
  .sharewrap {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .sharewrap .scard {
    max-width: 420px;
    margin: 0 auto;
  }
}
.scard.square {
  aspect-ratio: 1 / 1;
}
.sharel {
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9.5px;
  opacity: 0.85;
}
.roundline {
  font-size: 10.5px;
  opacity: 0.7;
  text-align: center;
}
.cap {
  font-size: 11.5px;
  color: var(--text3);
  text-align: center;
  margin-top: 10px;
}
.btns {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}
</style>
