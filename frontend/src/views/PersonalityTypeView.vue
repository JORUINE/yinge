<template>
  <div class="detail">
    <RouterLink to="/personality/types" class="back">← 返回图鉴</RouterLink>

    <div v-if="loading" class="state muted">加载中…</div>

    <template v-else-if="type">
      <!-- ⚠️ 2026-10-06：`.dim2 .bar2` 是**全局类**（结果页也在用），上一轮被改成用图形档
           `var(--pcf)`。自定义属性没有定义时 `var()` 会让整条声明失效 → 进度条静默变透明。
           所以**凡是用了 .dim2/.bar2 的页面都必须注入 --pcf**，漏一处就白改。 -->
      <!-- ⭐ 2026-10-06 demo：详情页换成「左人格卡 + 右文字介绍」，与结果页一以贯通。
           改前是「型号+名字+描述+按钮」在左、4 条维度在右，**完全没有人格卡画面**，
           和图鉴页/结果页/入口页一比就像另一个世界。 -->
      <!-- ⚠️ 2026-10-07 第二十九批：右栏那套「这个型看重的四个维度」列表已删除。
           用户："左边和右边的维度条 为什么这里用户还没测过就有了这个条子 …… 这肯定要优化"：
             · 卡面上本来就有同一组维度条（连数值一起）→ 右栏再抄一遍是**同一数据画两遍**；
             · 列表标题写死"四个维度"，而 CLM 这类只配了 3 条 → 标题与数据自相矛盾。
           只留卡面那套；右栏补一行小字说明"卡面维度 = 这个型的典型画像（后台配置）"，
           回答用户"还没测为什么有条"这个疑问。
           ⚠️ `.dim2 .bar2` 是全局类，必须注入 --pcf（漏注入进度条会静默变透明）。 -->
      <!-- ⭐ 2026-10-07 第三十一批：质感改成**照抄「我的测评回看页」（结果页 .ptmain）的做法**：
           虚化底 `.ptbg` 铺在**面板内部**，靠面板自己的 `border-radius` + `overflow:hidden` 裁边。
           ⚠️ 上一版把它铺在整页 `.detail` 上（inset:0 的矩形）→ 就出现了用户两次指出的
              "嵌套的矩形方框直角边"。铺在面板内部、由圆角裁掉，才不会有硬边。 -->
      <div class="ptcard ptcard-v2" :style="{ '--pc': pc, '--pc2': pc2, '--pc-rgb': pcRgb, '--pcf': pcf, '--pcf-rgb': pcfRgb }">
        <div class="ptbg" :style="bgStyle" aria-hidden="true"></div>
        <div class="glowc"></div>
        <div class="pthd pthd-v2">
          <div class="ptface">
            <PersonalityCard
              :code="type.code"
              :name="type.name"
              :desc="type.description"
              :dims="dims"
              mode="long"
              :max-width="380"
            />
          </div>
          <div class="ptinfo">
            <div class="ptcode">{{ type.code }}</div>
            <div class="ptname">{{ type.name }}</div>
            <div class="accent2"></div>
            <p class="ptdesc">{{ type.description }}</p>

            <!-- ⚠️ 2026-10-07 第三十批：删掉重复维度列表后右栏空了一大块（用户红框）。
                 这三块**全部面向用户**，不是给开发者看的字段说明：
                   · 「这类人是谁」= 一句话听众画像（listeningProfile）
                   · 「他们常听」   = 该型推荐专辑的挑选原则（albumHints，做成词条）
                   · 「依据」       = 心理学出处（theory，放最下面小字，答辩可讲）
                 数据 2026-09-22 就写进模型了，但接口这轮才吐出来（见 service.getTypeByCode）。
                 原 `.ptcap` 那句"由后台配置、不是你的测评结果"是写给开发者看的，已删 ——
                 卡面维度条的含义改由上面「这类人是谁」自然带出。 -->
            <!-- ⭐ 2026-10-07 第三十二批（按用户要求定稿）：
                 右栏三块 =「这类人是谁」（人格描述）+「他们的特征」+「他们常听」；
                 专业出处不再单独开一块，只作页脚一行小注释（.pttheory）。
                 用户原话："介绍我让你丰满对这个人格的描述和它们的特征 还有常听，
                 不是让你加一个研究怎么说，你这些专业数据放在最底下的注释那种就好"。 -->
            <section v-if="type.listeningProfile" class="ptblock">
              <h3 class="ptblock-h">这类人是谁</h3>
              <p class="ptblock-t">{{ type.listeningProfile }}</p>
            </section>

            <section v-if="(type.traits || []).length" class="ptblock">
              <h3 class="ptblock-h">他们的特征</h3>
              <ul class="ptlist">
                <li v-for="t in type.traits" :key="t">{{ t }}</li>
              </ul>
            </section>

            <section v-if="(type.albumHints || []).length" class="ptblock">
              <h3 class="ptblock-h">他们常听</h3>
              <div class="pchips">
                <span v-for="h in type.albumHints" :key="h" class="pchip">{{ h }}</span>
              </div>
            </section>

            <div class="btns">
              <RouterLink to="/personality/test" class="btn pri">测测我是哪种</RouterLink>
              <RouterLink to="/personality/types" class="btn ghost">看看其他人格</RouterLink>
            </div>

            <p v-if="type.theory" class="pttheory">
              <span class="pttheory-k">依据</span>{{ type.theory }}
            </p>
          </div>
        </div>
      </div>

      <div class="hd" style="margin-top: 26px">
        <b>这个人格常听的专辑</b><span>来自该类型的推荐池</span>
      </div>

      <div v-if="albums.length" class="recs">
        <div v-for="a in albums" :key="a.albumId" class="alb" :style="accentStyle(a)">
          <div class="art albc"><img :src="a.artworkUrl" :alt="a.name" loading="lazy" /></div>
          <b>{{ a.name }}</b>
          <div class="accent"></div>
          <div class="ar"><i></i>{{ a.artistName || '—' }}</div>
          <div class="mt num">{{ year(a.releaseDate) }} · {{ a.trackCount }} 首</div>
        </div>
      </div>
      <p v-else class="note">
        这个类型还没有推荐专辑 —— 后台 `recommendAlbumIds` 为空。管理员在「人格类型管理」里绑几张即可。
      </p>
    </template>

    <div v-else class="state g-card">
      <h2>找不到这个人格类型</h2>
      <RouterLink to="/personality/types" class="btn ghost">回图鉴</RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';
import { typeColor, typeColorAlpha, typeColorRgb, typeColorFill, typeColorFillRgb, normalizeScores } from '@/utils/personality.js';
import PersonalityCard from '@/components/PersonalityCard.vue';
import { makeBlurBackdrop } from '@/utils/blurBackdrop.js';
import { accentStyleOf, ensureAlbumAccent } from '@/utils/coverColor.js';

const route = useRoute();
const code = route.params.code;

const loading = ref(true);
const type = ref(null);
const albums = ref([]);

const pc = computed(() => typeColor(type.value?.code || code));
// ⚠️ 2026-10-05 修：同 PersonalityResultView —— 别再自己切十六进制，
//    typeColor() 返回的是 `var(--tc-XXX)`，切串必然失败并静默掉成兜底蓝。
const pc2 = computed(() => typeColorAlpha(type.value?.code || code, 0.3));
/** 品牌色的 rgb 三元组（给 `rgb(var(--pc-rgb) / .12)` 这类半透明用） */
const pcRgb = computed(() => typeColorRgb(type.value?.code || code));
/** 图形档（进度条/描边用）—— `.dim2 .bar2` 是全局类，不注入的话进度条会静默变透明 */
const pcf = computed(() => typeColorFill(type.value?.code || code));
const pcfRgb = computed(() => typeColorFillRgb(type.value?.code || code));
const dims = computed(() => normalizeScores(type.value?.dims));

/* 整页底色晕染：canvas 画虚化（html2canvas 不支持 CSS filter / backdrop-filter） */
const blurBg = ref('');
const bgStyle = computed(() => (blurBg.value ? { backgroundImage: `url(${blurBg.value})` } : {}));
async function buildBlurBg() {
  const c = String(type.value?.code || code || '').toUpperCase();
  if (!c) return;
  try {
    blurBg.value = await makeBlurBackdrop(`/img/personality/bg-${c}.jpg`, { long: 420, blurDiv: 26, wash: 0.6 });
  } catch { /* 没底图就退回纯色 */ }
}

const year = (d) => (d ? String(d).slice(0, 4) : '');
/** 专辑主色走 coverColor（读封面真色），不再用 albumId 满饱和哈希色（守则规则 ⑤） */
function accentStyle(album) {
  return accentStyleOf(album);
}
function primeAccents() {
  for (const a of albums.value.slice(0, 6)) ensureAlbumAccent(a).catch(() => {});
}

onMounted(async () => {
  try {
    const data = await personalityApi.typeDetail(code);
    type.value = data;
    albums.value = data.recommendAlbums || [];
    primeAccents();
    buildBlurBg();
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.detail {
  position: relative;
  padding-bottom: var(--sp-7);
}
/* ⭐ 照抄「我的测评回看页」（结果页 .ptmain）的做法，四件套：
   ① 面板自己圆角 + overflow:hidden ⇒ 内部那层虚化图的**四边被裁成圆角**，不会出现直角矩形；
   ② 虚化底 .ptbg 铺在面板内部（尺寸交给下面的 .ptcard-v2 .ptbg）；
   ③ 白纱幕 ::after 把底色抬到"文字可读"的亮度；
   ④ 文字层 z-index 抬到纱幕之上。
   ⚠️ 这就是"不要嵌套矩形直角边"的正解：靠父级圆角裁，而不是给色块自己描边或羽化。 */
.ptcard-v2 {
  overflow: hidden;
  background: var(--glass2);
}
.ptcard-v2 .ptbg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-color: var(--pcf, transparent);
  background-size: cover;
  background-position: 50% 26%;
  background-repeat: no-repeat;
  opacity: 0.9;
}
.ptcard-v2::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(160deg, rgb(var(--scrim-rgb) / 0.72), rgb(var(--scrim-rgb) / 0.82));
}
.ptcard-v2 > .glowc,
.ptcard-v2 > .pthd {
  position: relative;
  z-index: 1;
}

/* 研究证据列表 */
.ptlist {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text2);
}
.ptlist li { margin-bottom: 7px; }
.ptlist li::marker { color: var(--pc); }
.ptnote {
  margin: 10px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text3);
}
.ptev {
  padding-top: 14px;
  border-top: 1px solid rgb(var(--pcf-rgb) / 0.28);
}
.back {
  display: inline-block;
  color: var(--brand-deep);
  font-size: var(--fs-sm);
  margin: var(--sp-5) 0 var(--sp-4);
}
.state {
  margin: var(--sp-7) auto;
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
/* 右栏三块（第三十批）：这类人是谁 / 他们常听 / 依据 —— 全部面向用户 */
.ptblock {
  margin: 0 0 20px;
}
.ptblock-h {
  margin: 0 0 9px;
  font-size: var(--fs-sm);
  font-weight: 700;
  letter-spacing: 1.4px;
  color: var(--pc);
}
.ptblock-t {
  margin: 0;
  font-size: 15.5px;
  line-height: 1.75;
  color: var(--text);
}
.pchips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pchip {
  font-size: var(--fs-sm);
  line-height: 1.4;
  padding: 6px 12px;
  border-radius: 999px;
  color: var(--pc);
  background: rgb(var(--pcf-rgb) / 0.12);
  border: 1px solid rgb(var(--pcf-rgb) / 0.34);
}
.pttheory {
  margin: 18px 0 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text3);
}
.pttheory-k {
  display: inline-block;
  margin-right: 7px;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--pc);
  background: rgb(var(--pcf-rgb) / 0.12);
}
@media (max-width: 860px) {
  .pthd {
    grid-template-columns: 1fr;
  }
  .recs {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
