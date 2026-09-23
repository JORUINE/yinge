<template>
  <div class="result" :style="{ '--pc': pc, '--pc2': pc2 }">
    <div v-if="loading" class="state muted">正在生成你的音乐人格卡…</div>

    <template v-else-if="result">
      <!-- ⚠️ 2026-09-23：`--pc/--pc2` 提到根 `.result` 上（原来只挂在 `.ptcard`）。
           根因：`.ptcard` **外面**的「同型代表作」网格也用了 `var(--pc)`，
           取不到变量 → 渐变失效退成白底，而字是白色 → 整块"白板看不见"（用户报的空白）。 -->
      <div ref="cardEl" class="ptcard">
        <div class="glowc"></div>
        <div class="pthd">
          <div>
            <div class="ptcode">{{ result.typeCode }} · {{ result.typeName }}</div>
            <div class="ptname">{{ result.typeName }}</div>
            <div class="accent2"></div>
            <p class="ptdesc">{{ result.typeDescription }}</p>
          </div>

          <div>
            <div v-for="s in dims" :key="s.key" class="dim2">
              <div class="lb"><span>{{ s.label }}</span><span>{{ s.ten }} / 10</span></div>
              <div class="bar2"><i :style="{ width: s.ratio + '%' }"></i></div>
            </div>
            <p v-if="!dims.length" class="hint muted">这次没记录维度得分</p>
          </div>
        </div>

        <!-- 听歌人设标签（D3-C 传播层 · 随卡导出，便于分享"你是哪个型"） -->
        <div class="pttags" v-if="personaTags.length">
          <span v-for="t in personaTags" :key="t" class="pttag">{{ t }}</span>
        </div>

        <div class="ai2" v-if="result.aiComment">
          <h4>AI 个性解读</h4>
          <p>{{ result.aiComment }}</p>
          <span class="src">
            {{ result.aiCommentSource === 'llm' ? '由大语言模型根据你的作答生成 · 非模板文案' : '当前为模板解读（配置大模型密钥后自动升级为个性化生成）' }}
          </span>
        </div>
      </div>

      <!-- ⚠️ 操作按钮必须放在导出元素 `.ptcard` **之外**（2026-09-23 用户报的 bug：
           导出的图片里印着「正在生成…」）。html2canvas 导出瞬间按钮文字正好被切成
           "正在生成…"，而按钮又在导出对象内部 → 一起被印进图。
           这就是设计守则里"交互按钮放导出元素之外"那条硬规则。 -->
      <div class="btns cardacts">
        <button class="btn pri" type="button" :disabled="exporting" @click="download">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 16V4M8 8l4-4 4 4M5 20h14" />
          </svg>
          {{ exporting ? '正在生成…' : '生成人格卡图片' }}
        </button>
        <RouterLink to="/personality/types" class="btn ghost">看看其他人格</RouterLink>
      </div>

      <!-- 娱乐声明（2026-09-22 用户要求"人格测试那里也要加上一个告示，娱乐为主，不要当真"）
           结果页比测试页更需要它 —— 用户此刻最可能把结论当真。 -->
      <p class="funnote">
        <b>这是一份娱乐向结果，别当真。</b>
        它反映的是你这次答题时的偏好倾向，不是心理诊断，也不能定义你是什么人。
        音乐与情绪本来就多变 —— 隔几天再测，结果不一样是正常的。
      </p>

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

      <!-- 同型代表作（D3-C 传播层 · 人工挑片，与该型气质一致；仅供"找同类"参考，不参与计分） -->
      <div class="hd" style="margin-top: 26px">
        <b>{{ result.typeName }} 都在听这些</b><span>和你是同一种耳朵的人，常驻这几张</span>
      </div>
      <div v-if="representatives.length" class="recs rep2">
        <div v-for="r in representatives" :key="r.artist + r.album" class="alb">
          <div class="art albc repface">{{ r.album.slice(0, 1) }}</div>
          <b>{{ r.album }}</b>
          <div class="ar"><i></i>{{ r.artist }}</div>
          <div class="mt num">同型代表作</div>
        </div>
      </div>

      <!-- 共建推荐池：让用户参与选出"这个人格该听什么"（2026-09-21 用户点名：
           "让用户参与进来选出所对应人格推荐的专辑这个功能还没做"）
           功能后端与页面早就通了（/personality/tag-albums），缺的是**用户找得到入口** ——
           以前只在人格测评的介绍页有个小按钮，测完拿到人格卡的人反而看不到。
           所以把入口放到这里：刚看完推荐的人，正是最想吐槽/补充推荐的人。 -->
      <div class="joinpool">
        <div class="jptx">
          <b>帮我们选出「{{ result.typeName }}」该听什么</b>
          <span>
            上面那几推荐是系统按榜单挑的。你觉得哪张专辑最像这个人格？投一票就行 ——
            <b>票数高的会被采纳进推荐池</b>，下一个人测完看到的就是你们选出来的。
          </span>
        </div>
        <RouterLink to="/personality/tag-albums" class="btn pri">去投一票</RouterLink>
      </div>

      <!-- 好友对比（D3-C 传播层 · 占位：单机版暂无好友体系，预留入口与文案） -->
      <div class="friendcmp">
        <div class="fctx">
          <b>和好友比一比，谁是同一种耳朵？</b>
          <span>
            把你的结果发到群里，邀请好友也测一测。看看你们是「撞型」还是「互补」——
            同一种型说明听歌口味高度重合，互补的两型往往能互相安利到对方没听过的歌。
          </span>
        </div>
        <button class="btn ghost" type="button" disabled title="好友体系上线后开放">邀请好友测一测（即将开放）</button>
      </div>

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
import { typeColor, normalizeScores, PERSONA_TAGS, TYPE_REPRESENTATIVES } from '@/utils/personality.js';
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

// D3-C 传播层：人设标签 + 同型代表作（按 typeCode 取静态映射）
const personaTags = computed(() => PERSONA_TAGS[result.value?.typeCode] || []);
const representatives = computed(() => TYPE_REPRESENTATIVES[result.value?.typeCode] || []);

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
/* 卡片外的操作按钮（导出元素之外，见模板注释） */
.cardacts {
  margin-top: 16px;
}
.hint {
  font-size: var(--fs-sm);
}
@media (max-width: 860px) {
  .pthd {
    grid-template-columns: 1fr;
  }
}

/* 共建推荐池 CTA：一张醒目的玻璃条，看完推荐就能顺手投一票 */
.joinpool {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin: 20px 0 4px;
  padding: 16px 20px;
  border-radius: var(--r);
  border: 1px solid rgba(14, 165, 233, 0.34);
  background: linear-gradient(100deg, rgba(14, 165, 233, 0.13), var(--glass2) 62%);
  box-shadow: var(--shadow-2);
}
.joinpool .jptx {
  flex: 1 1 320px;
  min-width: 0;
}
.joinpool .jptx b {
  display: block;
  font-size: 16px;
  letter-spacing: -0.2px;
}
.joinpool .jptx span {
  display: block;
  margin-top: 4px;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text2);
}

/* 听歌人设标签（D3-C · 随卡导出的小药丸，强化"你是哪个型"的分享点） */
.pttags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}
.pttag {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  padding: 7px 12px;
  border-radius: 999px;
  color: var(--pc);
  background: var(--pc2);
  border: 1px solid var(--pc2);
  letter-spacing: 0.2px;
}

/* 同型代表作卡片：用首字占位封面（无真封面，避免空图与版权问题） */
.recs.rep2 .albc.repface {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--pc), var(--pc2));
  letter-spacing: 1px;
}

/* 好友对比占位（D3-C · 即将开放的玻璃条） */
.friendcmp {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin: 22px 0 4px;
  padding: 16px 20px;
  border-radius: var(--r);
  border: 1px solid rgba(138, 107, 193, 0.32);
  background: linear-gradient(100deg, rgba(138, 107, 193, 0.12), var(--glass2) 62%);
  box-shadow: var(--shadow-2);
}
.friendcmp .fctx {
  flex: 1 1 320px;
  min-width: 0;
}
.friendcmp .fctx b {
  display: block;
  font-size: 16px;
  letter-spacing: -0.2px;
}
.friendcmp .fctx span {
  display: block;
  margin-top: 4px;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text2);
}

/* 娱乐声明（结果页） */
.funnote {
  margin: 18px 0 0;
  padding: 12px 18px;
  border-radius: 12px;
  border: 1px solid rgba(245, 158, 11, 0.32);
  background: linear-gradient(100deg, rgba(245, 158, 11, 0.09), var(--glass2) 62%);
  font-size: 13px;
  line-height: 1.75;
  color: var(--text2);
}
.funnote b {
  color: #b45309;
}
html[data-theme='dark'] .funnote b {
  color: #fcd34d;
}
</style>
