<template>
  <AdminShell>
    <div class="admhd">
      <div>
        <h3>歌手组合</h3>
        <p>
          创建页「常用组合」就是这里的<b>系统组合</b>，所有人可见；
          用户自己收藏的组合只他自己看得到，这里只做只读展示。
        </p>
      </div>
      <button class="mini" type="button" @click="openCreate">+ 新建系统组合</button>
    </div>

    <!-- 用户喜爱的 PK 组合榜：不看"保存了什么"，只看"真开过多少局" -->
    <div class="popwrap g-card">
      <div class="pophd">
        <b>用户喜爱的 PK 组合</b>
        <span>
          按<b>真实开过的局数</b>排（不是按收藏数）· 同一位歌手的组合已合并统计 ·
          觉得哪个值得进「常用组合」，点右边一键采纳
        </span>
      </div>
      <div v-if="popLoading" class="state muted">统计中…</div>
      <table v-else-if="popular.length" class="tbl">
        <thead>
          <tr>
            <th style="width: 46px">#</th>
            <th>组合</th>
            <th style="width: 92px">开了多少局</th>
            <th style="width: 84px">多少人</th>
            <th style="width: 92px">打完比例</th>
            <th style="width: 120px">最近一次</th>
            <th class="act" style="width: 128px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in popular" :key="p.key">
            <td class="num">{{ i + 1 }}</td>
            <td class="ell">{{ p.label }}</td>
            <td class="num"><b>{{ p.battles }}</b></td>
            <td class="num">{{ p.userCount }}</td>
            <td class="num">{{ p.finishRate }}%</td>
            <td class="ell muted">{{ when(p.lastAt) }}</td>
            <td class="act">
              <span v-if="p.adopted" class="muted">已是系统组合</span>
              <button v-else class="mini" type="button" :disabled="adopting === p.key" @click="adopt(p)">
                {{ adopting === p.key ? '采纳中…' : '采纳' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="state muted">还没有人对战记录 —— 用户开过局之后，这里会按热度自动排出来。</p>
    </div>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!list.length" class="state g-card">
      <h4>还没有组合</h4>
      <p class="muted">建几个常用组合（如"周杰伦 vs 林俊杰"），用户创建对决时可一键装填。</p>
      <button class="btn pri sm" type="button" @click="openCreate">新建系统组合</button>
    </div>

    <table v-else class="tbl">
      <thead>
        <tr>
          <th style="width: 210px">组合名</th>
          <th>歌手</th>
          <th style="width: 130px">规模</th>
          <th style="width: 100px">来源</th>
          <th style="width: 100px">赛制</th>
          <th class="act" style="width: 250px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in list" :key="c.comboId">
          <td class="ell">{{ c.label }}</td>
          <td class="ell">{{ (c.artists || []).map((a) => a.name).join(' × ') || '—' }}</td>
          <td class="num">
            {{ c.scopeType === 'aligned' ? `${c.alignCount || 8} 张/位` : `${c.perArtist} 张/位` }}
          </td>
          <td>
            <span class="tagx" :class="c.isSystem ? 'tp' : 'wn'">{{ c.isSystem ? '系统' : '用户自建' }}</span>
          </td>
          <td>
            <!-- 2026-09-20：组合现在自带赛制，点一下就知道会进哪个模式 -->
            <span class="tagx" :class="c.scopeType === 'aligned' ? 'ok' : 'tp'">
              {{ c.scopeType === 'aligned' ? '对位赛' : '混战' }}
            </span>
          </td>
          <td class="act">
            <!-- 2026-09-20 用户要求："后台这里应该加入修改功能" ——
                 以前用户自建的是（只读），现在管理员可以维护**任意**组合：
                 改名 / 编辑（成员与张数）/ 删除，用户自建的还能一键转为系统组合。 -->
            <button class="mini" type="button" @click="openRename(c)">改名</button>
            <button class="mini" type="button" @click="openEdit(c)">编辑</button>
            <button class="mini" type="button" @click="removeCombo(c)">删除</button>
            <button v-if="!c.isSystem" class="mini" type="button" @click="makeSystem(c)">转为系统</button>
          </td>
        </tr>
      </tbody>
    </table>

    <el-dialog v-model="dialog" :title="dlgTitle" width="560px" align-center>
      <div v-if="dlgMode === 'rename'" class="frow">
        <label>组合名</label>
        <el-input v-model="label" maxlength="40" show-word-limit />
      </div>

      <template v-else>
        <div class="frow">
          <label>组合名</label>
          <el-input v-model="label" maxlength="40" show-word-limit placeholder="如：周杰伦 vs 林俊杰" />
        </div>
        <div class="frow">
          <label>搜歌手加入（2–6 位）</label>
          <div class="srow">
            <el-input v-model="term" placeholder="输入歌手名（如 周杰伦），回车或点搜索" @keyup.enter="search" />
            <el-button type="primary" :loading="searching" @click="search">搜索</el-button>
          </div>
          <div v-if="candidates.length" class="picks">
            <el-button
              v-for="a in candidates"
              :key="a.artistId"
              size="small"
              plain
              @click="addArtist(a)"
            >
              {{ a.name }} ＋
            </el-button>
          </div>
        </div>
        <div class="frow">
          <label>已加入（点 × 移除）</label>
          <div class="picks">
            <el-tag
              v-for="(a, i) in artists"
              :key="a.artistId"
              closable
              type="success"
              @close="artists.splice(i, 1)"
            >
              {{ a.name }}
            </el-tag>
            <span v-if="!artists.length" class="muted">还没有加入歌手</span>
          </div>
        </div>
        <div class="frow">
          <label>赛制</label>
          <el-radio-group v-model="scopeType">
            <el-radio-button label="multi-artist">混战（多歌手淘汰制）</el-radio-button>
            <el-radio-button label="aligned">对位赛（逐张对照）</el-radio-button>
          </el-radio-group>
          <p class="fhint">
            前台点这个组合时会<b>自动进入对应模式</b>：混战组合 → 多歌手混战；对位组合 → 对位赛。
          </p>
        </div>
        <div class="frow">
          <label>{{ scopeType === 'aligned' ? '对位张数（1–24）' : '每位歌手几张' }}</label>
          <el-input-number v-if="scopeType === 'aligned'" v-model="alignCount" :min="1" :max="24" />
          <el-input-number v-else v-model="perArtist" :min="4" :max="50" />
        </div>
      </template>

      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </AdminShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import AdminShell from '@/layouts/AdminShell.vue';
import { comboApi, musicApi } from '@/api';

const loading = ref(true);
const saving = ref(false);
const searching = ref(false);
const list = ref([]);

const dialog = ref(false);
/** 弹窗模式：create 新建系统组合 ｜ rename 只改名 ｜ edit 改成员与张数 */
const dlgMode = ref('create');
const editing = ref(null); // rename 模式的目标
const editTarget = ref(null); // edit 模式的目标
const dlgTitle = computed(() =>
  dlgMode.value === 'rename' ? '给组合改名' : dlgMode.value === 'edit' ? `编辑「${editTarget.value?.label || ''}」` : '新建系统组合',
);
const label = ref('');
const perArtist = ref(8);
/** 赛制：multi-artist 混战 / aligned 对位赛（2026-09-20 新增，组合自带赛制） */
const scopeType = ref('multi-artist');
const alignCount = ref(8);
const term = ref('');
const candidates = ref([]);
const artists = ref([]);

// 用户喜爱的 PK 组合榜
const popular = ref([]);
const popLoading = ref(true);
const adopting = ref('');

async function loadPopular() {
  popLoading.value = true;
  try {
    const d = await comboApi.popular({ limit: 20 });
    popular.value = d.list || [];
  } catch (err) {
    ElMessage.error(err?.message || '热度统计失败');
  } finally {
    popLoading.value = false;
  }
}

/** 一键采纳：把榜单里的组合建成系统组合（成员与张数照搬） */
async function adopt(p) {
  adopting.value = p.key;
  try {
    await comboApi.create({
      label: p.label.slice(0, 40),
      scopeType: 'multi-artist',
      artists: (p.artists || []).map((a) => ({ artistId: a.artistId, name: a.name })),
      perArtist: 8,
      isSystem: true,
    });
    ElMessage.success(`「${p.label}」已加入常用组合`);
    await Promise.all([load(), loadPopular()]);
  } catch (err) {
    ElMessage.error(err?.message || '采纳失败');
  } finally {
    adopting.value = '';
  }
}

function when(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const day = `${dt.getMonth() + 1}月${dt.getDate()}日`;
  return `${day} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

async function load() {
  loading.value = true;
  try {
    const data = await comboApi.list();
    list.value = data.list || [];
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  dlgMode.value = 'create';
  editing.value = null;
  editTarget.value = null;
  label.value = '';
  perArtist.value = 8;
  scopeType.value = 'multi-artist';
  alignCount.value = 8;
  term.value = '';
  candidates.value = [];
  artists.value = [];
  dialog.value = true;
}

function openRename(c) {
  dlgMode.value = 'rename';
  editing.value = c;
  editTarget.value = null;
  label.value = c.label;
  dialog.value = true;
}

/** 编辑组合成员与张数（管理员可改任意组合，含用户自建的） */
function openEdit(c) {
  dlgMode.value = 'edit';
  editing.value = null;
  editTarget.value = c;
  label.value = c.label;
  perArtist.value = c.perArtist || 8;
  scopeType.value = c.scopeType === 'aligned' ? 'aligned' : 'multi-artist';
  alignCount.value = c.alignCount || 8;
  artists.value = (c.artists || []).map((a) => ({ artistId: a.artistId, name: a.name }));
  term.value = '';
  candidates.value = [];
  dialog.value = true;
}

/** 把用户自建的组合采纳为系统组合 */
async function makeSystem(c) {
  try {
    await comboApi.update(c.comboId, { isSystem: true });
    ElMessage.success(`「${c.label}」已转为系统组合`);
    await load();
  } catch (err) {
    ElMessage.error(err?.message || '转换失败');
  }
}

async function search() {
  if (!term.value.trim()) return;
  searching.value = true;
  try {
    const data = await musicApi.searchArtists({ term: term.value.trim(), limit: 8 });
    candidates.value = data.artists || [];
    if (!candidates.value.length) ElMessage.info('没有找到匹配的歌手');
  } catch (err) {
    ElMessage.error(err?.message || '搜索失败');
  } finally {
    searching.value = false;
  }
}

function addArtist(a) {
  if (artists.value.some((x) => x.artistId === a.artistId)) return;
  if (artists.value.length >= 6) {
    ElMessage.warning('一个组合最多 6 位歌手');
    return;
  }
  artists.value = [...artists.value, a];
  candidates.value = [];
  term.value = '';
}

async function save() {
  if (!label.value.trim()) {
    ElMessage.info('组合名不能为空');
    return;
  }
  saving.value = true;
  try {
    if (dlgMode.value === 'rename') {
      await comboApi.update(editing.value.comboId, { label: label.value.trim() });
      ElMessage.success('已改名');
    } else if (dlgMode.value === 'edit') {
      if (artists.value.length < 2) {
        ElMessage.info('至少加入 2 位歌手');
        saving.value = false;
        return;
      }
      await comboApi.update(editTarget.value.comboId, {
        label: label.value.trim(),
        scopeType: scopeType.value,
        alignCount: scopeType.value === 'aligned' ? alignCount.value : undefined,
        perArtist: perArtist.value,
        artists: artists.value.map((a) => ({
          artistId: a.artistId,
          name: a.name,
          albumCount: perArtist.value,
        })),
      });
      ElMessage.success('已保存修改');
    } else {
      if (artists.value.length < 2) {
        ElMessage.info('至少加入 2 位歌手');
        saving.value = false;
        return;
      }
      await comboApi.create({
        label: label.value.trim(),
        isSystem: true, // 管理员 → 系统组合
        scopeType: scopeType.value,
        alignCount: scopeType.value === 'aligned' ? alignCount.value : undefined,
        perArtist: perArtist.value,
        artists: artists.value.map((a) => ({
          artistId: a.artistId,
          name: a.name,
          albumCount: perArtist.value,
        })),
      });
      ElMessage.success('系统组合已保存');
    }
    dialog.value = false;
    await load();
  } catch (err) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function removeCombo(c) {
  try {
    await comboApi.remove(c.comboId);
    ElMessage.success('已删除');
    await load();
  } catch (err) {
    ElMessage.error(err?.message || '删除失败');
  }
}

onMounted(() => {
  load();
  loadPopular();
});
</script>

<style scoped>
.frow {
  margin-bottom: 14px;
}
.frow label {
  display: block;
  font-size: 13px;
  color: var(--text2);
  margin-bottom: 6px;
}
.srow {
  display: flex;
  gap: 8px;
}
.picks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
/* 用户喜爱的 PK 组合榜：内容区留两侧距离（守则 73） */
.popwrap {
  max-width: 1080px;
  margin: 0 0 22px;
  padding: 16px 18px 18px;
}
.pophd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.pophd b {
  font-size: 15px;
}
.pophd span {
  font-size: 12.5px;
  color: var(--text3);
  line-height: 1.6;
}
.fhint {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--text2);
  line-height: 1.5;
}
</style>
