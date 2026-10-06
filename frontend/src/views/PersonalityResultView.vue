<template>
  <div
    class="result"
    :style="{
      '--pc': pc,
      '--pc-rgb': pcRgb,
      '--pcf': pcf,
      '--pcf-rgb': pcfRgb,
      '--pcf2': pcf2,
      '--pc2': pc2,
      '--pc-light': pal.light,
      '--pc-deep': pal.deep,
      '--pc-ink': pal.ink,
      '--pc-accent': pal.accent,
      '--pc-glow': pal.glow,
    }"
  >
    <div v-if="loading" class="state muted">正在生成你的音乐人格卡…</div>

    <template v-else-if="result">
      <!-- ⭐ 2026-10-06 布局重排（用户原话）：
           「应该是人格卡在左边然后得分在右边，下面是 ai 解读，
             就和之前的设计思路以一贯通，然后整个卡片和维度得分就在一个整体的卡片里的样子」
           改前是三段割裂的独立卡片：人格卡（居中）/ 完整维度得分 / 人设标签 / AI 解读。
           现在：**一张整体面板** = 左边人格卡 + 右边维度得分与人设标签，AI 解读在下面跨整宽。

           ⚠️ 导出范围**仍然只锁 `.cardshot`（只有卡）**，不要把 ref 往上挪 ——
              上一轮实测：拿外层导出得到的是 2264×2374 的一整列网页，根本没法当分享图；
              只锁卡 → 1080×1439。AI 解读与维度得分都在 `.cardshot` 之外，所以不会进图。 -->
      <div class="pcexport">
        <div class="ptmain">
          <div class="ptmain-l">
            <div ref="cardEl" class="cardshot">
              <PersonalityCard
                :code="result.typeCode"
                :name="result.typeName"
                :desc="result.typeDescription"
                :dims="dims"
                mode="long"
                :max-width="520"
              />
            </div>
          </div>

          <div class="ptmain-r">
            <h4 class="dimlist-h">完整维度得分</h4>
            <div v-if="dims.length" class="dimlist">
              <div v-for="s in dims" :key="s.key" class="dim2">
                <div class="lb"><span>{{ s.label }}</span><span class="num">{{ s.ten }} / 10</span></div>
                <div class="bar2"><i :style="{ width: s.ratio + '%' }"></i></div>
              </div>
            </div>
            <p v-else class="hint muted">这次没记录维度得分</p>

            <!-- 听歌人设标签（D3-C 传播层）
                 ⚠️ 2026-10-05：标签**不再随卡导出**（导出范围收成了卡本身，见上）。
                    你原话是"随卡导出，便于分享你是哪个型"——要加回来只需把 .pttags 挪进 .cardshot。 -->
            <div class="pttags" v-if="personaTags.length">
              <span v-for="t in personaTags" :key="t" class="pttag">{{ t }}</span>
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
          <!-- 2026-09-23 第十二批：有真封面就出封面（用户："要真封面"）；
               拿不到才回退成原来的首字占位（.ph），不会白板。 -->
          <div class="art albc repface" :class="{ ph: !r.artworkUrl }">
            <img v-if="r.artworkUrl" :src="r.artworkUrl" :alt="r.album" loading="lazy" crossorigin="anonymous" />
            <template v-else>{{ r.album.slice(0, 1) }}</template>
          </div>
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
import {
  typeColor,
  typeColorAlpha,
  typeColorRgb,
  typeColorFill,
  typeColorFillRgb,
  typeColorFillAlpha,
  typePalette,
  normalizeScores,
  PERSONA_TAGS,
  TYPE_REPRESENTATIVES,
} from '@/utils/personality.js';
import PersonalityCard from '@/components/PersonalityCard.vue';
import { accentStyleOf, ensureAlbumAccent } from '@/utils/coverColor.js';

const route = useRoute();
const id = route.params.id;

const loading = ref(true);
const exporting = ref(false);
const result = ref(null);
const albums = ref([]);
const cardEl = ref(null);

/**
 * ⭐ 人格色系（2026-09-30 革新）：把整套色系注入成 CSS 变量。
 * 旧的两个（--pc/--pc2）继续保留，页面零破坏；新增 --pc-light / --pc-deep / --pc-ink / --pc-glow
 * 供卡面渐变与文字取用（`--pc-ink` 保证浅底配深字、深底配浅字）。
 */
const pal = computed(() => typePalette(result.value?.typeCode));
const pc = computed(() => typeColor(result.value?.typeCode));
// ⚠️ 2026-10-05 修：原来这里自己切 `pc.value` 的十六进制（`c.startsWith('#')`），
//    而 typeColor() 改成返回品牌色 `var(--tc-XXX)` 之后，这个分支永远不成立 →
//    **所有人格的半透明配色统一掉成兜底蓝**，看不出是哪一型（语法检查查不出，只有页面能看出来）。
//    现在交给 typeColorAlpha()，真值只有一处。
const pc2 = computed(() => typeColorAlpha(result.value?.typeCode, 0.3));
/** 品牌色的 rgb 三元组（给 `rgb(var(--pc-rgb) / .12)` 这类半透明用；同样是主题变量） */
const pcRgb = computed(() => typeColorRgb(result.value?.typeCode));
/**
 * ⭐ 图形档（2026-10-06）：进度条 / 标签底 / 缩略图底一律用这一档，不用文字档。
 * 根因：文字档为了 4.6:1 压得很暗，画在 8px 高的条上又暗又闷，
 * 而且**和人格卡面对不上**（用户原话：「词句收藏下面却是红色」，它那张卡是暖金旧纸）。
 */
const pcf = computed(() => typeColorFill(result.value?.typeCode));
const pcfRgb = computed(() => typeColorFillRgb(result.value?.typeCode));
/** 图形档的半透明版：给渐变暗端 / 占位底用（必须是能解析成颜色的值，不能直接塞 rgb 三元组） */
const pcf2 = computed(() => typeColorFillAlpha(result.value?.typeCode, 0.55));

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
/* ⚠️ 2026-10-05：原来这里有一条 `@media(max-width:860px){ .pthd{...} }` ——
   卡面改成 PersonalityCard 组件后已经没有 .pthd 了，留着是一条永远不匹配的死规则。
   组件自己的响应式由 ResizeObserver 按容器宽算缩放（见 PersonalityCard.vue）。 */

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

/* 听歌人设标签（D3-C · 强化"你是哪个型"的分享点） */
.pttags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pttag {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  padding: 7px 12px;
  border-radius: 999px;
  /* ⚠️ 标签现在活在**页面底色**上（以前贴在深色卡面里）。
     半透明底必须用斜杠语法 —— 写 `rgba(var(--pc-rgb), .12)` 会被整条丢掉，
     标签就变成"没有底的裸字"。
     ⭐ 2026-10-06：底色与描边改用**图形档** `--pcf-rgb`（更亮更艳，跟人格卡面同一个色相），
        文字仍用文字档 `--pc`（要读得清）。之前底和字都用文字档 → 标签底灰暗、跟卡面对不上。 */
  color: var(--pc);
  background: rgb(var(--pcf-rgb) / 0.14);
  border: 1px solid rgb(var(--pcf-rgb) / 0.34);
  letter-spacing: 0.2px;
}
.pttags {
  margin-top: 20px;
}

/* 同型代表作卡片封面：优先真封面（img）；无封面时回退首字占位（.ph，避免空图与版权问题） */
.recs.rep2 .albc.repface {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.recs.rep2 .albc.repface img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.recs.rep2 .albc.repface.ph {
  font-size: 30px;
  font-weight: 700;
  color: #fff;
  /* 无封面时的占位底色：用**图形档**（更接近人格卡面），不用文字档。
     ⚠️ 渐变两端都必须是"能解析成颜色的值" —— `--pcf-rgb` 是 `228 90 9` 这种空格通道三元组，
        直接塞进 gradient 会让整条声明非法被丢掉（这里已经踩过一次）。 */
  background: linear-gradient(135deg, var(--pcf), var(--pcf2));
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
