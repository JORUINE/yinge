<template>
  <div class="tagpage">
    <div class="container">
      <div class="thead">
        <span class="kicker">音格 · 一起建造推荐池</span>
        <h1>这张专辑，更像哪一型？</h1>
        <p class="sub">
          你在帮我们做一件事：把 <b>人格类型</b> 和 <b>专辑</b> 连起来。
          你投的每一票都会被统计，票数高的专辑会被采纳进对应人格的「常听专辑」——
          也就是别人测完人格后看到的那几推荐。
        </p>
        <p class="meta">
          已投 <b class="num">{{ votedCount }}</b> 张<template v-if="votedCount"> · 随时可以再投，一人一张只算最新一票</template>
        </p>

        <!-- 规则说清楚（2026-09-21 用户："每人只算一票规则连我都没太理解，还有用户点错了怎么办"）：
             把"一人一票"到底是"不能多投"还是"可以改主意"讲明白，并给出改投的办法。 -->
        <ul class="howto">
          <li><b>一人一张只算一票。</b>你给同一张专辑投的票永远只有一票 —— 反复点也不会多算。</li>
          <li><b>投错了可以改。</b>再点一次别的类型就是改投，以你最后一次的选择为准（页面会提示你当前投的是哪一型）。</li>
          <li><b>投过的专辑不会再出现</b>，所以不用担心重复劳动；「说不清 · 换一张」不产生任何票。</li>
        </ul>
      </div>

      <div v-if="loading" class="state muted">正在取一张专辑…</div>

      <div v-else-if="allDone" class="state g-card">
        <h4>曲库里的专辑你都投过一遍了</h4>
        <p class="muted">厉害。等我们加了新专辑，再回来继续；也可以去「人格图鉴」看看各型的推荐现在长什么样。</p>
        <RouterLink class="btn pri" :to="{ name: 'personality' }">去看人格图鉴</RouterLink>
      </div>

      <template v-else-if="album">
        <div class="tagcard g-card">
          <div class="art">
            <img :src="album.artworkUrl" :alt="album.name" />
          </div>
          <div class="info">
            <h2>{{ album.name }}</h2>
            <p class="who">{{ album.artistName }}<template v-if="year"> · {{ year }}</template><template v-if="album.trackCount"> · {{ album.trackCount }} 首</template></p>

            <div class="types">
              <button
                v-for="t in types"
                :key="t.code"
                class="tbtn"
                :class="{ on: picked === t.code }"
                type="button"
                :disabled="submitting"
                @click="vote(t.code)"
              >
                <b>{{ t.name }}</b>
                <em>{{ t.code }}</em>
                <span>{{ t.description }}</span>
              </button>
            </div>

            <!-- 试听：判断"这张专辑像哪一型"得能听到东西（用户："这里也加入试听功能和歌曲切换，
                 就搬我们自己的之前的代码"）。组件自包含：不点不发请求。 -->
            <AlbumPlayer :album="album" />

            <!-- 投完之后停在本张，把"投给谁 + 能改投"讲清楚，再让用户自己点下一张
                 （以前是投完立刻跳走，用户点错了连回都回不来）。 -->
            <div v-if="picked" class="voted">
              <div class="vtx">
                <b>✓ 已投给「{{ pickedName }}」</b>
                <span>点上面别的类型就是改投，以最后一次为准；确认没问题就继续下一张。</span>
              </div>
              <button class="btn pri" type="button" :disabled="submitting" @click="next">
                下一张 →
              </button>
            </div>

            <div class="ops">
              <button class="btn ghost sm" type="button" :disabled="submitting" @click="next">
                说不清 · 换一张
              </button>
              <span class="hint" style="margin: 0">
                {{ picked ? '想改就再点一个类型，改完点「下一张」' : '点类型即投票；说不清就换一张（不产生票）' }}
              </span>
            </div>
          </div>
        </div>

        <p class="foot hint">
          数据只用来统计"哪张专辑更适合哪一型"；一人一张只算最新一票，可以随时改投，不会重复计数。
        </p>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * 专辑归类投票（2026-09-20 新增功能）
 * ------------------------------------------------------------
 * 用户参与式收集：看一张专辑 → 选它更像哪一型 → 沉淀为真实数据，
 * 后台按票数采纳进「人格类型 → 推荐专辑」。这正是用户要的"让用户参与进来，我们收集数据后去采纳"。
 * 交互：点类型即投票并自动出下一张；「说不清」跳过（不产生票）。
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';
import AlbumPlayer from '@/components/AlbumPlayer.vue';

const loading = ref(true);
const album = ref(null);
const types = ref([]);
const votedCount = ref(0);
const allDone = ref(false);
const submitting = ref(false);
const picked = ref('');
/** 本张专辑是否已经投过（用于"改投不再加票"的兜底计数） */
const votedThisAlbum = ref(false);

/** 当前选中那一型的中文名（投完的提示条要用） */
const pickedName = computed(() => types.value.find((t) => t.code === picked.value)?.name || picked.value);

const year = computed(() => {
  const d = album.value?.releaseDate;
  return d ? String(d).slice(0, 4) : '';
});

async function loadNext() {
  loading.value = true;
  picked.value = '';
  votedThisAlbum.value = false;
  try {
    const d = await personalityApi.nextTagAlbum();
    album.value = d.album;
    types.value = d.types || [];
    votedCount.value = d.votedCount || 0;
    allDone.value = Boolean(d.allDone);
  } catch (err) {
    ElMessage.error(err?.message || '加载失败，请先登录');
  } finally {
    loading.value = false;
  }
}

/**
 * 投票（可改投）
 * ------------------------------------------------------------
 * 后端语义：同一用户对同一张专辑**只保留最新一票**（upsert），所以反复点是改主意、不会多算。
 * 交互（2026-09-21 用户："每人只算一票规则连我都没太理解，点错了怎么办"）：
 *   投完**不自动跳走**，停在本张并显示"已投给 X · 点别的类型就是改投"，
 *   用户确认后自己点「下一张」。这样点错了原地就能改，规则也一眼看得懂。
 */
async function vote(typeCode) {
  if (submitting.value || !album.value) return;
  submitting.value = true;
  picked.value = typeCode;
  try {
    const d = await personalityApi.voteTag({ albumId: album.value.id, typeCode });
    // 后端会回真实票数；万一没回，就只在本张的**第一次**投票时 +1（改投不再加）
    votedCount.value = d?.votedCount ?? (votedThisAlbum.value ? votedCount.value : votedCount.value + 1);
    votedThisAlbum.value = true;
    const t = types.value.find((x) => x.code === typeCode);
    ElMessage.success(`已记为「${t?.name || typeCode}」· 可以改投，也可以继续下一张`);
  } catch (err) {
    ElMessage.error(err?.message || '投票失败');
  } finally {
    submitting.value = false;
  }
}

/** 跳过 / 下一张：换一张专辑，不产生选票 */
function next() {
  loadNext();
}

onMounted(loadNext);
</script>

<style scoped>
.tagpage {
  min-height: 70vh;
  padding: 32px 0 56px;
}
.thead {
  text-align: center;
  margin-bottom: 22px;
}
.thead .kicker {
  font-size: 13.5px;
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--brand-deep);
}
.thead h1 {
  margin: 8px 0 10px;
  font-size: 32px;
  letter-spacing: -0.5px;
}
.thead .sub {
  max-width: 660px;
  margin: 0 auto;
  font-size: 15px;
  line-height: 1.75;
  color: var(--text2);
}
.thead .meta {
  margin-top: 10px;
  font-size: 14px;
  color: var(--text3);
}
.tagcard {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 24px;
  padding: 22px;
  margin-top: 8px;
}
.tagcard .art {
  aspect-ratio: 1;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 18px 46px rgba(8, 58, 92, 0.22);
}
.tagcard .art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tagcard .info h2 {
  font-size: 23px;
  letter-spacing: -0.3px;
  margin-bottom: 4px;
}
.tagcard .who {
  font-size: 14.5px;
  color: var(--text2);
  margin-bottom: 16px;
}
.types {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 10px;
}
.tbtn {
  text-align: left;
  padding: 12px 14px;
  border-radius: 13px;
  border: 1px solid var(--gbd);
  background: var(--glass2);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.12s;
}
.tbtn:hover:not(:disabled) {
  border-color: var(--brand);
  transform: translateY(-1px);
}
.tbtn.on {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.25);
  background: rgba(14, 165, 233, 0.09);
}
.tbtn b {
  display: inline-block;
  font-size: 15.5px;
}
.tbtn em {
  font-style: normal;
  margin-left: 8px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--brand-deep);
}
.tbtn span {
  display: block;
  margin-top: 5px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text2);
}
.ops {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
}
.foot {
  margin-top: 14px;
  text-align: center;
}
@media (max-width: 720px) {
  .tagcard {
    grid-template-columns: minmax(0, 1fr);
  }
  .tagcard .art {
    max-width: 260px;
    margin: 0 auto;
  }
}

/* 规则说明（一人一票 / 可改投）—— 用户说"连我都没太理解"，所以要写在最显眼处 */
.howto {
  max-width: 700px;
  margin: 16px auto 0;
  padding: 14px 18px 14px 34px;
  text-align: left;
  border-radius: 12px;
  background: var(--glass2);
  border: 1px solid var(--line);
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--text2);
}
.howto li {
  margin: 0;
}
.howto li + li {
  margin-top: 4px;
}
.howto b {
  color: var(--text);
}

/* 投完之后的确认条：说清"投给谁 + 能改投" */
.voted {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid rgba(14, 165, 233, 0.36);
  background: linear-gradient(100deg, rgba(14, 165, 233, 0.13), var(--glass2) 62%);
}
.voted .vtx {
  flex: 1 1 260px;
  min-width: 0;
}
.voted .vtx b {
  display: block;
  font-size: 15px;
}
.voted .vtx span {
  display: block;
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text2);
}
</style>
