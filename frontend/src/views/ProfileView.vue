<template>
  <div class="profile">
    <div class="uh">
      <div class="av">{{ initial }}</div>
      <div class="who">
        <b>{{ user?.nickname || '未登录' }}</b>
        <span>
          账号 {{ user?.account }} · 加入于 {{ joinMonth }}
          <template v-if="stats.battleTotal || stats.resultTotal">
            · 已进行 {{ stats.battleTotal || 0 }} 次对决、{{ stats.resultTotal || 0 }} 次测评
          </template>
        </span>
      </div>
      <span class="btn ghost sm right" @click="editing = !editing">编辑资料</span>
    </div>

    <div v-if="editing" class="g-card editor">
      <div class="fld">
        <label>昵称</label>
        <input v-model="nickname" type="text" maxlength="20" placeholder="给自己起个响亮的名字" />
        <div class="hint">2 至 16 个字，需全站唯一</div>
      </div>
      <div class="btns">
        <button class="btn pri sm" type="button" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        <button class="btn ghost sm" type="button" @click="editing = false">取消</button>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><b class="num">{{ stats.battleTotal ?? 0 }}</b><span>发起对决</span></div>
      <div class="stat"><b class="num">{{ stats.voteTotal ?? 0 }}</b><span>累计投票</span></div>
      <div class="stat"><b class="num">{{ stats.resultTotal ?? 0 }}</b><span>完成测评</span></div>
      <div class="stat"><b class="num">{{ stats.favoriteTotal ?? 0 }}</b><span>收藏专辑</span></div>
    </div>

    <div class="tabline">
      <div :class="{ on: tab === 'battles' }" @click="setTab('battles')">我的对决</div>
      <div :class="{ on: tab === 'personality' }" @click="setTab('personality')">我的测评</div>
      <div :class="{ on: tab === 'favorites' }" @click="setTab('favorites')">我的收藏</div>
      <div :class="{ on: tab === 'combos' }" @click="setTab('combos')">我的组合</div>
    </div>

    <div v-if="loading" class="state muted">加载中…</div>

    <template v-else>
      <!-- 我的对决 -->
      <div v-if="tab === 'battles'" class="list">
        <div v-for="b in battles" :key="b.battleId" class="r">
          <div class="th">
            <img v-if="b.coverUrl" :src="b.coverUrl" alt="" loading="lazy" />
            <span v-else class="noart">♪</span>
          </div>
          <div class="m">
            <b>{{ titleOf(b) }}</b>
            <span>
              {{ b.poolTarget || '—' }} 张专辑 ·
              {{ b.status === 'finished' ? '已完赛' : '进行中' }} ·
              共 {{ b.stepTotal || 0 }} 场 · {{ fmtDate(b.createdAt) }}
            </span>
          </div>
          <div class="v">
            <RouterLink
              :to="{ name: b.status === 'finished' ? 'battle-result' : 'battle-pk', params: { id: b.battleId } }"
              class="btn ghost sm"
            >
              {{ b.status === 'finished' ? '回看' : '继续' }}
            </RouterLink>
          </div>
        </div>
        <p v-if="!battles.length" class="note">还没有对决 —— <RouterLink to="/battle/create">去创建一场</RouterLink>。</p>
      </div>

      <!-- 我的测评 -->
      <div v-else-if="tab === 'personality'" class="list">
        <div v-for="p in results" :key="p.resultId" class="r">
          <div class="th" :style="{ background: typeColor(p.typeCode) }"></div>
          <div class="m">
            <b>{{ p.typeName || p.typeCode }}</b>
            <span>{{ p.typeCode }} · {{ fmtDate(p.createdAt) }}</span>
          </div>
          <div class="v">
            <RouterLink :to="{ name: 'personality-result', params: { id: p.resultId } }" class="btn ghost sm">回看</RouterLink>
          </div>
        </div>
        <p v-if="!results.length" class="note">还没测过 —— <RouterLink to="/personality/test">去测一测</RouterLink>。</p>
      </div>

      <!-- 我的收藏 -->
      <div v-else-if="tab === 'favorites'" class="list">
        <!-- ⚠️ 2026-09-23 修复「破图 + 名字全是—」：收藏接口返回的是**嵌套**形状
             `{ favoriteId, targetType, targetId, target: {...专辑字段} }`（后端 listFavorites
             统一走 serializeAlbum 放在 `target` 里）；本页原来读的是**扁平**字段
             （f.artworkUrl / f.name / f.artistName）→ 全部取不到：
             封面 src 为空（破图）、name 空、artistName 空 → 落到「—」。
             与 FavoritesView 的口径对齐（那边读的就是 f.target.*）。 -->
        <div v-for="f in favorites" :key="f.favoriteId || f.targetId || f.albumId" class="r">
          <div class="th">
            <img v-if="favAlbum(f)?.artworkUrl" :src="favAlbum(f).artworkUrl" :alt="favAlbum(f)?.name || ''" loading="lazy" />
            <span v-else class="noart">♫</span>
          </div>
          <div class="m">
            <b>{{ favAlbum(f)?.name || f.name || f.title || '已失效' }}</b>
            <span>{{ favAlbum(f)?.artistName || f.artistName || '—' }} · {{ year(favAlbum(f)?.releaseDate || f.releaseDate) }}</span>
          </div>
          <div class="v">
            <button class="btn ghost sm" type="button" @click="unfavorite(f)">取消收藏</button>
          </div>
        </div>
        <p v-if="!favorites.length" class="note">还没有收藏的专辑。</p>
      </div>

      <!-- 我的组合：用户自己收藏的歌手 PK 组合（只有本人可见） -->
      <div v-else class="list">
        <div v-for="c in combos" :key="c.comboId" class="r">
          <div class="th"><span class="noart">♫</span></div>
          <div class="m">
            <b>{{ c.label }}</b>
            <span>
              {{ (c.artists || []).map((a) => a.name).join(' × ') }} · 每位 {{ c.perArtist }} 张
            </span>
          </div>
          <div class="v">
            <RouterLink to="/battle/create" class="btn ghost sm">去用</RouterLink>
            <button class="btn ghost sm" type="button" @click="removeCombo(c)">删除</button>
          </div>
        </div>
        <p v-if="!combos.length" class="note">
          还没有自己的组合 —— 在 <RouterLink to="/battle/create">创建对决</RouterLink> 里选好歌手后点「＋ 收藏当前组合」，就会出现在这里。
        </p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { authApi, battleApi, personalityApi, favoriteApi, comboApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { fmtDate } from '@/utils/labels';
import { typeColor } from '@/utils/personality.js';

const auth = useAuthStore();
const user = computed(() => auth.user);
const initial = computed(() => (user.value?.nickname || '?').slice(0, 1));

const stats = ref({});
const tab = ref('battles');
const loading = ref(false);
const battles = ref([]);
const results = ref([]);
const favorites = ref([]);
const loaded = ref({ battles: false, personality: false, favorites: false, combos: false });
/** 我收藏的歌手组合（只有本人可见） */
const combos = ref([]);

const editing = ref(false);
const saving = ref(false);
const nickname = ref('');

const year = (d) => (d ? String(d).slice(0, 4) : '');
/**
 * 收藏条目 → 专辑对象。后端返回嵌套形状（`target`），但为向后兼容也接受扁平形状。
 * 2026-09-23 修复：本页原来直接读扁平字段，导致封面破图、名字显示「—」。
 */
const favAlbum = (f) => (f && (f.target || (f.name || f.artworkUrl ? f : null))) || null;
const joinMonth = computed(() => {
  const d = user.value?.createdAt;
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getFullYear()} 年 ${dt.getMonth() + 1} 月`;
});

const SCOPE_CN = {
  artist: '单歌手对决',
  'multi-artist': '跨歌手混战',
  genre: '按流派对决',
  era: '按年代对决',
  custom: '手动挑选对决',
  aligned: '对位赛',
  duel: '指定对决',
};
function titleOf(b) {
  const names = (b.artists || []).map((a) => a.name).filter(Boolean);
  if (b.scopeType === 'multi-artist' && names.length) return `${names.join(' × ')} · 混战`;
  if (b.scopeType === 'artist' && names.length) return `${names[0]} 专辑对决`;
  return SCOPE_CN[b.scopeType] || '专辑对决';
}

async function setTab(t) {
  tab.value = t;
  if (loaded.value[t]) return;
  loading.value = true;
  try {
    if (t === 'battles') {
      const d = await battleApi.listMine({ page: 1, pageSize: 20 });
      battles.value = d.list || [];
    } else if (t === 'personality') {
      const d = await personalityApi.listMine({ page: 1, pageSize: 20 });
      results.value = d.list || [];
    } else if (t === 'combos') {
      const d = await comboApi.list();
      // 只列"我自己建的"（系统组合在创建页里已经能点到）
      combos.value = (d.list || []).filter((c) => c.mine);
    } else {
      const d = await favoriteApi.list({ page: 1, pageSize: 20 });
      favorites.value = d.list || [];
    }
    loaded.value[t] = true;
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function unfavorite(f) {
  try {
    await favoriteApi.remove(f.targetId || f.albumId);
    favorites.value = favorites.value.filter((x) => (x.targetId || x.albumId) !== (f.targetId || f.albumId));
    ElMessage.success('已取消收藏');
  } catch (err) {
    ElMessage.error(err?.message || '操作失败');
  }
}

/** 删除「我的组合」 */
async function removeCombo(c) {
  try {
    await comboApi.remove(c.comboId);
    combos.value = combos.value.filter((x) => x.comboId !== c.comboId);
    ElMessage.success('已删除这个组合');
  } catch (err) {
    ElMessage.error(err?.message || '删除失败');
  }
}

async function save() {
  if (!nickname.value.trim()) {
    ElMessage.info('昵称不能为空');
    return;
  }
  saving.value = true;
  try {
    const data = await authApi.updateProfile({ nickname: nickname.value.trim() });
    auth.user = data;
    editing.value = false;
    ElMessage.success('昵称已更新');
  } catch (err) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  nickname.value = user.value?.nickname || '';
  try {
    stats.value = await authApi.myStats();
  } catch (err) {
    ElMessage.error(err?.message || '统计加载失败');
  }
  setTab('battles');
});
</script>

<style scoped>
.profile {
  padding: var(--sp-5) 0 var(--sp-7);
}
.right {
  margin-left: auto;
}
.editor {
  margin-top: 16px;
  padding: 20px 22px;
}
.btns {
  display: flex;
  gap: 10px;
}
.state {
  padding: var(--sp-6);
  text-align: center;
}
.th {
  display: flex;
  align-items: center;
  justify-content: center;
}
.noart {
  font-size: 18px;
  color: var(--text3);
}
@media (max-width: 720px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
