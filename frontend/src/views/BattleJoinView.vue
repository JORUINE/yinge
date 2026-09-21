<template>
  <div class="join">
    <div class="page-head">
      <p class="eyebrow">好友一起玩 · 同款签表</p>
      <h1>和 {{ info.inviter || '好友' }} 打同一批专辑</h1>
    </div>

    <div v-if="loading" class="state muted">正在读取这份签表…</div>

    <div v-else-if="errMsg" class="state g-card">
      <h2>打不开这份签表</h2>
      <p class="muted">{{ errMsg }}</p>
      <RouterLink :to="{ name: 'battle-create' }" class="btn pri">自己开一局</RouterLink>
    </div>

    <template v-else>
      <!-- 签表概览（守盲盒原则：只露少量封面做示意，不摊开全部出战专辑） -->
      <div class="jwrap">
        <div class="jcard g-card">
          <div class="jhd">
            <b>这份签表</b>
            <span>{{ scopeLabel }} · {{ info.albumCount }} 张专辑 · {{ info.stepTotal }} 步打完</span>
          </div>
          <div v-if="(info.artists || []).length" class="jwho">
            <span v-for="a in info.artists" :key="a.artistId" class="chip on">{{ a.name }}</span>
          </div>
          <div v-if="(info.previewAlbums || []).length" class="jprev">
            <img
              v-for="a in info.previewAlbums"
              :key="a.albumId"
              :src="a.artworkUrl"
              :alt="a.name"
              loading="lazy"
            />
            <span class="jmore">…共 {{ info.albumCount }} 张，开局后才会全部揭晓</span>
          </div>
          <p class="jnote">
            你和 {{ info.inviter || '好友' }} 会从<b>完全同一批专辑</b>里选，分组与对阵顺序也一模一样。
            打完之后就能看到：两个人的冠军是不是同一张、从第几步开始选得不一样。
          </p>

          <div class="btns">
            <button class="btn pri" type="button" :disabled="starting" @click="start">
              {{ starting ? '正在开局…' : startLabel }}
            </button>
            <button class="btn ghost" type="button" @click="copyLink">复制这份签表链接</button>
          </div>
        </div>

        <!-- 对比区 -->
        <div class="jcard g-card">
          <div class="jhd">
            <b>谁和谁在打</b>
            <span>打完才能比冠军 · 已有 {{ finishedCount }} / {{ (cmp.participants || []).length }} 人打完</span>
          </div>

          <div v-if="!(cmp.participants || []).length" class="note muted">还没有人加入。</div>
          <div v-else class="plist">
            <div v-for="p in cmp.participants" :key="p.battleId" class="p" :class="{ me: p.isMe }">
              <span class="who">
                {{ p.nickname }}<i v-if="p.isMe">（我）</i><i v-if="p.isHost">发起方</i>
              </span>
              <span class="st">{{ p.finished ? '已打完' : '进行中' }}</span>
              <template v-if="p.champion">
                <img :src="p.champion.artworkUrl" :alt="p.champion.name" loading="lazy" />
                <span class="cn">{{ p.champion.name }}</span>
              </template>
              <span v-else class="cn muted">冠军还没决出</span>
            </div>
          </div>

          <template v-if="cmp.championAgree">
            <p class="agree">🎉 冠军完全一致 —— 你俩的审美在同一张专辑上会合了。</p>
          </template>
          <p v-else-if="finishedCount >= 2" class="agree diff">冠军不一样 —— 分歧从下面这一步开始。</p>


          <p v-if="myBattleId && !cmp.rival" class="note muted">
            还没有好友加入 —— 把链接发给他，两边都打完就能比了。
          </p>
        </div>
      </div>

      <!-- 逐步对照（2026-09-21 重做）
           ⚠️ 用户："这个逐步对照做的太糙了，你应该放到整体一个模块居中的那种来展示，对比要直观清晰，哪里不一样"。
           以前它塞在右侧窄卡片里的一个折叠块里 —— 两列都被挤到很窄、长专辑名挤成两三行，
           而且"哪一步开始不一样"只写在折叠标题里，展开后看不出来。
           现在：**独立整块 + 居中（最大 920px）**；一行一条对照，
           一致的行中性、**不一致的行整条高亮 + 带色条**，
           第一条分歧那一行单独描边并打「分歧起点」标，顶部给图例与一句话结论。 -->
      <section v-if="(cmp.steps || []).length" class="cmpfull">
        <div class="cfhd">
          <div class="cftx">
            <b>逐步对照</b>
            <span>同一批专辑、同一套对阵 —— 看看两个人的选择从哪一步开始分叉</span>
          </div>
          <div class="cfsum" :class="{ diff: !cmp.championAgree && cmp.firstDiff }">
            <template v-if="cmp.championAgree">冠军一致</template>
            <template v-else-if="cmp.firstDiff">
              从第 <b class="num">{{ cmp.firstDiff.step }}</b> 步开始不一样 · {{ cmp.firstDiff.label }}
            </template>
            <template v-else>步骤完全一致</template>
          </div>
        </div>

        <div class="cflegend">
          <span class="lg same">选择一致</span>
          <span class="lg diff">选择不一样</span>
          <span class="lgwho">左＝我　右＝{{ cmp.rival?.nickname || '好友' }}</span>
        </div>

        <div class="cflist">
          <div
            v-for="(s, i) in cmp.steps"
            :key="i"
            class="cfrow"
            :class="{
              same: s.same,
              diff: !s.same && s.mine.length && s.theirs.length,
              start: cmp.firstDiff && cmp.firstDiff.step === i + 1,
            }"
          >
            <div class="cfno">
              <b class="num">{{ i + 1 }}</b>
              <span>{{ s.label }}</span>
              <i v-if="cmp.firstDiff && cmp.firstDiff.step === i + 1" class="cfstart">分歧起点</i>
            </div>
            <div class="cfcell mine">
              <span class="cfwho">我</span>
              <span class="cfpick">{{ s.mine.join(' / ') || '—' }}</span>
            </div>
            <div class="cfmark">
              <span v-if="s.same" class="cfok">✓</span>
              <span v-else class="cfdiff">≠</span>
            </div>
            <div class="cfcell theirs">
              <span class="cfwho">{{ cmp.rival?.nickname || '好友' }}</span>
              <span class="cfpick">{{ s.theirs.join(' / ') || '—' }}</span>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { battleApi } from '@/api';

const route = useRoute();
const router = useRouter();
const code = computed(() => String(route.params.code || '').toUpperCase());

const loading = ref(true);
const starting = ref(false);
const errMsg = ref('');
const info = ref({});
const cmp = ref({});
const myBattleId = ref('');

const SCOPE_LABEL = {
  artist: '单歌手',
  'multi-artist': '多歌手混战',
  genre: '流派',
  era: '年代',
  custom: '自选专辑',
  aligned: '对位赛',
  duel: '指定对决',
};
const scopeLabel = computed(() => SCOPE_LABEL[info.value.scopeType] || '专辑对决');
const finishedCount = computed(() => (cmp.value.participants || []).filter((p) => p.finished).length);
const startLabel = computed(() => (myBattleId.value ? '继续我的同款对决' : '开始同款对决'));

async function load() {
  loading.value = true;
  errMsg.value = '';
  try {
    const d = await battleApi.inviteInfo(code.value);
    info.value = d || {};
    const c = await battleApi.inviteCompare(code.value);
    cmp.value = c || {};
    const me = (c?.participants || []).find((p) => p.isMe);
    myBattleId.value = me?.battleId || '';
  } catch (e) {
    errMsg.value = e?.message || '签表读取失败';
  } finally {
    loading.value = false;
  }
}

async function start() {
  if (myBattleId.value) {
    router.push({ name: 'battle-pk', params: { id: myBattleId.value } });
    return;
  }
  starting.value = true;
  try {
    const d = await battleApi.joinInvite(code.value);
    router.push({ name: 'battle-pk', params: { id: d.battleId } });
  } catch (e) {
    ElMessage.error(e?.message || '开局失败');
  } finally {
    starting.value = false;
  }
}

async function copyLink() {
  const url = `${location.origin}/battle/join/${code.value}`;
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success('链接已复制，发给好友就能一起玩');
  } catch {
    ElMessage.info(url);
  }
}

onMounted(load);
</script>

<style scoped>
.join {
  padding-bottom: var(--sp-7);
}
/* 守则 73：内容区必须有两侧留白约束，不能拉满整屏 */
.jwrap {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 22px;
  align-items: start;
  max-width: 1040px;
  margin: 20px auto 0;
}
@media (max-width: 900px) {
  .jwrap {
    grid-template-columns: minmax(0, 1fr);
  }
}
.jcard {
  padding: 18px 20px 20px;
}
.jhd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.jhd b {
  font-size: 16px;
}
.jhd span {
  font-size: 14px;
  color: var(--muted);
}
.jwho {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.jprev {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.jprev img {
  width: 62px;
  height: 62px;
  border-radius: 10px;
  object-fit: cover;
}
.jmore {
  font-size: 14px;
  color: var(--muted);
}
.jnote {
  font-size: 14.5px;
  line-height: 1.75;
  color: var(--muted);
  margin: 0 0 14px;
}
.btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.plist {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.p {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 44px minmax(0, 1.4fr);
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-2, rgba(255, 255, 255, 0.04));
}
.p.me {
  border-color: var(--brand);
}
.p .who {
  font-size: 14.5px;
  font-weight: 600;
}
.p .who i {
  font-style: normal;
  font-weight: 400;
  font-size: 13.5px;
  color: var(--muted);
  margin-left: 4px;
}
.p .st {
  font-size: 13.5px;
  color: var(--muted);
}
.p img {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
}
.p .cn {
  font-size: 14px;
}
.agree {
  margin: 0 0 10px;
  font-size: 14.5px;
  font-weight: 600;
}
.agree.diff {
  color: var(--warn, #f59e0b);
}
.fold {
  margin-top: 6px;
  border-top: 1px dashed var(--line);
  padding-top: 10px;
}
.foldhd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  cursor: pointer;
  font-size: 14.5px;
  color: var(--muted);
}
.foldhd b {
  color: var(--text);
}
.note {
  font-size: 14px;
  line-height: 1.7;
}

/* =====================================================================
   逐步对照（2026-09-21 重做）—— 独立整块、居中、一行一条
   ⚠️ 字号一律 ≥12px（守则 88：任何界面文字不得小于 12px）
   ===================================================================== */
.cmpfull {
  max-width: 920px;
  margin: 24px auto 0;
}
.cfhd {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.cftx b {
  display: block;
  font-size: 21px;
  letter-spacing: -0.3px;
}
.cftx span {
  display: block;
  margin-top: 5px;
  font-size: 13.5px;
  color: var(--text2);
}
.cfsum {
  flex: 0 0 auto;
  padding: 8px 15px;
  border-radius: 999px;
  font-size: 14.5px;
  font-weight: 700;
  background: rgba(34, 197, 94, 0.14);
  border: 1px solid rgba(34, 197, 94, 0.32);
  color: #15803d;
}
.cfsum.diff {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.38);
  color: #b45309;
}
html[data-theme='dark'] .cfsum {
  color: #86efac;
}
html[data-theme='dark'] .cfsum.diff {
  color: #fcd34d;
}
.cflegend {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--text3);
}
.cflegend .lg::before {
  content: '';
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 3px;
  margin-right: 7px;
  vertical-align: -1px;
}
.cflegend .lg.same::before {
  background: rgba(34, 197, 94, 0.5);
}
.cflegend .lg.diff::before {
  background: rgba(245, 158, 11, 0.72);
}
.cflegend .lgwho {
  margin-left: auto;
}
.cflist {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cfrow {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr) 40px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 11px 15px;
  border-radius: 13px;
  background: var(--glass2);
  border: 1px solid var(--line);
}
.cfrow.same {
  border-color: rgba(34, 197, 94, 0.26);
}
/* 不一致的行：整条泛暖色 + 左边一道色条，扫一眼就看得见"这一步分叉了" */
.cfrow.diff {
  border-color: rgba(245, 158, 11, 0.4);
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.1), var(--glass2) 58%);
  box-shadow: inset 4px 0 0 rgba(245, 158, 11, 0.72);
}
.cfrow.start {
  border-color: rgba(245, 158, 11, 0.72);
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.18), var(--glass2) 60%);
  box-shadow: inset 4px 0 0 #f59e0b, 0 6px 18px rgba(245, 158, 11, 0.16);
}
.cfno {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12.5px;
  color: var(--text3);
  line-height: 1.35;
}
.cfno b {
  font-size: 16px;
  color: var(--text2);
}
.cfstart {
  align-self: flex-start;
  font-style: normal;
  font-size: 12px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.45);
  white-space: nowrap;
}
.cfcell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cfcell.theirs {
  text-align: right;
}
.cfwho {
  font-size: 12px;
  color: var(--text3);
}
.cfpick {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  word-break: break-word;
}
.cfrow.diff .cfcell.mine .cfpick {
  color: #0284c7;
}
.cfrow.diff .cfcell.theirs .cfpick {
  color: #b45309;
}
html[data-theme='dark'] .cfrow.diff .cfcell.mine .cfpick {
  color: #7dd3fc;
}
html[data-theme='dark'] .cfrow.diff .cfcell.theirs .cfpick {
  color: #fcd34d;
}
.cfmark {
  display: flex;
  justify-content: center;
}
.cfok {
  color: #16a34a;
  font-weight: 800;
  font-size: 17px;
}
.cfdiff {
  color: #d97706;
  font-weight: 800;
  font-size: 18px;
}
@media (max-width: 760px) {
  .cfrow {
    grid-template-columns: 84px minmax(0, 1fr);
    row-gap: 6px;
  }
  .cfmark {
    display: none;
  }
  .cfcell.theirs {
    text-align: left;
    grid-column: 2;
  }
}
</style>
