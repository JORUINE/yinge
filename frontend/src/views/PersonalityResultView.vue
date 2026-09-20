<template>
  <div class="result">
    <div v-if="loading" class="state muted">正在生成你的音乐人格卡…</div>

    <template v-else-if="result">
      <div
        ref="cardEl"
        class="ptcard"
        :style="{ '--pc': pc, '--pc2': pc2 }"
      >
        <div class="glowc"></div>
        <div class="pthd">
          <div>
            <div class="ptcode">{{ result.typeCode }} · {{ result.typeName }}</div>
            <div class="ptname">{{ result.typeName }}</div>
            <div class="accent2"></div>
            <p class="ptdesc">{{ result.typeDescription }}</p>
            <div class="btns">
              <button class="btn pri" type="button" :disabled="exporting" @click="download">
                <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M12 16V4M8 8l4-4 4 4M5 20h14" />
                </svg>
                {{ exporting ? '正在生成…' : '生成人格卡图片' }}
              </button>
              <RouterLink to="/personality/types" class="btn ghost">看看其他人格</RouterLink>
            </div>
          </div>

          <div>
            <div v-for="s in dims" :key="s.key" class="dim2">
              <div class="lb"><span>{{ s.label }}</span><span>{{ s.ten }} / 10</span></div>
              <div class="bar2"><i :style="{ width: s.ratio + '%' }"></i></div>
            </div>
            <p v-if="!dims.length" class="hint muted">这次没记录维度得分</p>
          </div>
        </div>

        <div class="ai2" v-if="result.aiComment">
          <h4>AI 个性解读</h4>
          <p>{{ result.aiComment }}</p>
          <span class="src">
            {{ result.aiCommentSource === 'llm' ? '由大语言模型根据你的作答生成 · 非模板文案' : '当前为模板解读（配置大模型密钥后自动升级为个性化生成）' }}
          </span>
        </div>
      </div>

      <div class="hd" style="margin-top: 26px">
        <b>为你推荐的专辑</b><span>依据人格类型与维度得分匹配</span>
      </div>

      <div v-if="albums.length" class="recs">
        <div
          v-for="a in albums"
          :key="a.albumId"
          class="alb"
          :style="accentStyle(a)"
        >
          <div class="art albc"><img :src="a.artworkUrl" :alt="a.name" crossorigin="anonymous" /></div>
          <b>{{ a.name }}</b>
          <div class="accent"></div>
          <div class="ar"><i></i>{{ a.artistName || artistNameOf(a.artistId) }}</div>
          <div class="mt num">{{ year(a.releaseDate) }} · {{ a.trackCount }} 首</div>
          <div v-if="topDim" class="recmatch">匹配 {{ topDim.label }} {{ topDim.ten }}/10</div>
        </div>
      </div>
      <p v-else class="note">
        这个类型暂时没有配置推荐专辑池（后台 `recommendAlbumIds` 为空）—— 管理员在「人格类型管理」里补上即可。
      </p>

      <p class="note">
        <b>说明：</b>整张卡的配色跟着人格类型走；四根维度条把"为什么是这个类型"摊开给用户看；
        AI 解读标明来源；推荐专辑来自该类型的推荐池，并按你得分最高的维度排序。
      </p>
    </template>

    <div v-else class="state g-card">
      <h2>找不到这条测评结果</h2>
      <RouterLink to="/personality/test" class="btn pri">去测评</RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';
import { typeColor, normalizeScores } from '@/utils/personality.js';
import { accentStyleOf, ensureAlbumAccent } from '@/utils/coverColor.js';

const route = useRoute();
const id = route.params.id;

const loading = ref(true);
const exporting = ref(false);
const result = ref(null);
const albums = ref([]);
const cardEl = ref(null);

const pc = computed(() => typeColor(result.value?.typeCode));
const pc2 = computed(() => {
  const c = pc.value;
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.3)`;
  }
  return 'rgba(14,165,233,.3)';
});

const dims = computed(() => normalizeScores(result.value?.scores));
const topDim = computed(() => dims.value.slice().sort((a, b) => b.ten - a.ten)[0] || null);

const year = (d) => (d ? String(d).slice(0, 4) : '');
const artistNameOf = () => '';

/** 专辑主色走 coverColor（读封面真色），不再用 albumId 满饱和哈希色（守则规则 ⑤） */
function accentStyle(album) {
  return accentStyleOf(album);
}
function primeAccents() {
  for (const a of albums.value.slice(0, 6)) ensureAlbumAccent(a).catch(() => {});
}

async function download() {
  if (!cardEl.value) return;
  exporting.value = true;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(cardEl.value, {
      scale: Math.max(2, 1080 / cardEl.value.offsetWidth),
      backgroundColor: null,
      useCORS: true,
      logging: false,
    });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `音格-音乐人格-${result.value?.typeName || '结果'}.png`;
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

onMounted(async () => {
  try {
    const data = await personalityApi.result(id);
    result.value = data;
    albums.value = data.recommendAlbums || [];
    primeAccents();
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.result {
  padding-bottom: var(--sp-7);
}
.state {
  margin: var(--sp-8) auto;
  padding: var(--sp-6);
  max-width: 520px;
  text-align: center;
}
.btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.hint {
  font-size: var(--fs-sm);
}
@media (max-width: 860px) {
  .pthd {
    grid-template-columns: 1fr;
  }
}
</style>
