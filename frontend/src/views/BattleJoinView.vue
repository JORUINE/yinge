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

          <details v-if="(cmp.steps || []).length" class="fold">
            <summary class="foldhd">
              <b>逐 步 对 照</b>
              <span>
                从第
                <b class="num">{{ cmp.firstDiff ? cmp.firstDiff.step : '—' }}</b>
                步开始不一样{{ cmp.firstDiff ? `（${cmp.firstDiff.label}）` : '' }}
              </span>
            </summary>
            <div class="steplist">
              <div
                v-for="(s, i) in cmp.steps"
                :key="i"
                class="step"
                :class="{ same: s.same, diff2: !s.same && s.mine.length && s.theirs.length }"
              >
                <span class="sl">{{ s.label }}</span>
                <span class="sm">{{ s.mine.join(' / ') || '—' }}</span>
                <span class="svs">vs</span>
                <span class="st2">{{ s.theirs.join(' / ') || '—' }}</span>
              </div>
            </div>
          </details>

          <p v-if="myBattleId && !cmp.rival" class="note muted">
            还没有好友加入 —— 把链接发给他，两边都打完就能比了。
          </p>
        </div>
      </div>
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
.steplist {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.step {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) 28px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  font-size: 14px;
  padding: 6px 8px;
  border-radius: 8px;
}
.step.same {
  background: rgba(34, 197, 94, 0.08);
}
.step.diff2 {
  background: rgba(245, 158, 11, 0.1);
}
.step .sl {
  color: var(--muted);
}
.step .svs {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
.note {
  font-size: 14px;
  line-height: 1.7;
}
</style>
