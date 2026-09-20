<template>
  <AdminShell>
    <div class="admhd">
      <div>
        <h3>人格类型</h3>
        <p>
          六种人格的文案与<b>维度分</b>；每型可绑定 <b>3–5 张推荐专辑</b> ——
          前台人格卡的「常听专辑」就是这里绑的（只绑<b>曲库里已有的合格专辑</b>）。
        </p>
      </div>
      <div class="hdops">
        <button class="mini" type="button" @click="reload">刷新</button>
        <button class="mini pri" type="button" @click="openCreate">+ 新建类型</button>
      </div>
    </div>

    <div v-if="loading" class="state muted">加载中…</div>

    <template v-else>
      <!-- 六型概览：一眼看出哪一型还没绑推荐专辑 -->
      <div class="kpi4">
        <div class="k4"><b class="num">{{ list.length }}</b><span>人格类型</span><div class="dl">设计稿那套六型分类法</div></div>
        <div class="k4"><b class="num">{{ boundCount }}</b><span>已绑推荐专辑</span><div class="dl">还差 {{ Math.max(0, list.length - boundCount) }} 型</div></div>
        <div class="k4"><b class="num">{{ totalAlbums }}</b><span>推荐专辑总数</span><div class="dl">每型建议 3–5 张</div></div>
        <div class="k4"><b class="num">{{ list.length ? Math.round((boundCount / list.length) * 100) : 0 }}%</b><span>绑定完成度</span><div class="dl">人格线最后一个功能洞</div></div>
      </div>

      <div class="panel">
        <h4>类型列表</h4>
        <p class="ps">维度键固定为 <code>melody / rhythm / arrangement / calm</code>（设计稿口径），值可为负</p>
        <table class="tbl">
          <thead>
            <tr>
              <th style="width:78px">类型码</th>
              <th style="width:120px">名称</th>
              <th>描述</th>
              <th style="width:230px">维度分</th>
              <th style="width:150px">推荐专辑</th>
              <th class="act" style="width:190px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in list" :key="t._id">
              <td><span class="tagx tp">{{ t.code }}</span></td>
              <td><b>{{ t.name }}</b></td>
              <td class="ell muted">{{ t.description }}</td>
              <td class="ell">
                <span v-for="(v, k) in t.dims || {}" :key="k" class="dimtag">{{ k }} {{ v > 0 ? '+' : '' }}{{ v }}</span>
                <span v-if="!t.dims || !Object.keys(t.dims).length" class="muted">—</span>
              </td>
              <td>
                <span v-if="(t.recommendAlbums || t.recommendAlbumIds || []).length" class="tagx ok">
                  已绑 {{ (t.recommendAlbums || t.recommendAlbumIds || []).length }} 张
                </span>
                <span v-else class="tagx wn">未绑定</span>
              </td>
              <td class="act">
                <button class="mini" type="button" @click="openBind(t)">绑定专辑</button>
                <button class="mini" type="button" @click="openEdit(t)">编辑</button>
                <button class="mini" type="button" @click="remove(t)">删除</button>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="6" class="muted center">类型库为空 —— 先建几种人格类型，前台图鉴与测评才有内容。</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- 新建 / 编辑 -->
    <el-dialog v-model="dialog" :title="editing ? '编辑类型' : '新建类型'" width="560px" align-center @closed="resetForm">
      <el-form :model="form" label-position="top">
        <div class="row2">
          <el-form-item label="类型码" required>
            <el-input v-model="form.code" placeholder="例如 EXP" />
          </el-form-item>
          <el-form-item label="名称" required>
            <el-input v-model="form.name" placeholder="例如 探索者" />
          </el-form-item>
        </div>
        <el-form-item label="描述" required>
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="一句话描述这个人格" />
        </el-form-item>
        <el-form-item label="维度分（四个键，值可正可负）">
          <div class="dimgrid">
            <label v-for="k in DIM_KEYS" :key="k" class="dimrow">
              <span>{{ k }}</span>
              <el-input-number v-model="form.dims[k]" :min="-5" :max="5" size="small" />
            </label>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 绑定推荐专辑 -->
    <el-dialog v-model="bindDialog" :title="`给「${bindTarget?.name || ''}」绑推荐专辑`" width="720px" align-center>
      <div v-if="tagTop.length" class="tagtop">
        <div class="tt-hd">
          <b>用户投票推荐</b>
          <span>共 {{ tagVoters }} 人参与 · 票数最高的几张，点「加入推荐」即可采纳</span>
        </div>
        <div class="tt-list">
          <div v-for="a in tagTop" :key="a.id" class="tt-item">
            <img :src="a.artworkUrl" :alt="a.name" loading="lazy" />
            <div class="tt-tx">
              <b>{{ a.name }}</b>
              <span>{{ a.artistName }} · <em class="num">{{ a.votes }}</em> 票</span>
            </div>
            <el-button size="small" type="primary" plain @click="adoptTag(a)">加入推荐</el-button>
          </div>
        </div>
      </div>

      <div class="srow">
        <el-input
          v-model="albumTerm"
          placeholder="搜专辑名或歌手名（只搜曲库里已有的合格专辑），回车搜索"
          @keyup.enter="searchAlbums"
        />
        <el-button type="primary" :loading="searchingAlbums" @click="searchAlbums">搜索</el-button>
      </div>

      <p class="bindhint">
        已选 <b>{{ bindPicked.length }}</b> 张（建议 3–5 张）。前台人格卡按这里的顺序展示「常听专辑」。
      </p>
      <div v-if="bindPicked.length" class="picks">
        <el-tag v-for="(a, i) in bindPicked" :key="a.id" closable type="success" @close="unpick(i)">
          {{ a.name }}
        </el-tag>
      </div>

      <div v-if="albumResults.length" class="albgrid">
        <button
          v-for="a in albumResults"
          :key="a.id"
          class="albpick"
          :class="{ on: bindPicked.some((x) => x.id === a.id) }"
          type="button"
          @click="pick(a)"
        >
          <img :src="a.artworkUrl" :alt="a.name" loading="lazy" />
          <b>{{ a.name }}</b>
          <span>{{ a.artistName }} · {{ year(a.releaseDate) }}</span>
        </button>
      </div>
      <p v-else class="muted bindhint">
        {{ albumTerm ? '没有搜到（换个关键词，或先在「音乐数据」里把这位歌手的专辑拉进曲库）' : '输入关键词开始搜索' }}
      </p>

      <template #footer>
        <el-button @click="bindDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingBind" @click="saveBind">保存绑定</el-button>
      </template>
    </el-dialog>
  </AdminShell>
</template>

<script setup>
/**
 * 后台 · 人格类型管理（2026-09-20 重做）
 * ------------------------------------------------------------------
 * 本轮两件事：
 *  ① 版式统一到设计系统（AdminShell + admhd + kpi4 + panel + tbl），与看板/组合/题目页一致；
 *  ② 新增**推荐专辑绑定** —— 前台人格卡的「常听专辑」一直空着，就是因为后台没法绑。
 *     绑的必须是**本地曲库里的合格专辑**（前台按本地 ObjectId 取），所以搜的是
 *     新接口 GET /music/albums/search（只查本地库、毫秒级、不打扰 iTunes）。
 * 维度键固定为设计稿那套 melody / rhythm / arrangement / calm，改成可视化输入，不再让管理员手写 JSON。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import AdminShell from '@/layouts/AdminShell.vue';
import { adminApi, musicApi, personalityApi } from '@/api';

const DIM_KEYS = ['melody', 'rhythm', 'arrangement', 'calm'];
const year = (d) => (d ? String(d).slice(0, 4) : '');

const loading = ref(true);
const list = ref([]);
const dialog = ref(false);
const editing = ref(null);
const saving = ref(false);

const form = reactive({
  code: '',
  name: '',
  description: '',
  dims: { melody: 0, rhythm: 0, arrangement: 0, calm: 0 },
});

const boundCount = computed(
  () => list.value.filter((t) => (t.recommendAlbums || t.recommendAlbumIds || []).length).length,
);
const totalAlbums = computed(() =>
  list.value.reduce((n, t) => n + (t.recommendAlbums || t.recommendAlbumIds || []).length, 0),
);

function resetForm() {
  editing.value = null;
  form.code = '';
  form.name = '';
  form.description = '';
  DIM_KEYS.forEach((k) => {
    form.dims[k] = 0;
  });
}

function openCreate() {
  resetForm();
  dialog.value = true;
}

function openEdit(t) {
  editing.value = t._id;
  form.code = t.code;
  form.name = t.name;
  form.description = t.description;
  DIM_KEYS.forEach((k) => {
    form.dims[k] = Number(t.dims?.[k]) || 0;
  });
  dialog.value = true;
}

async function load() {
  loading.value = true;
  try {
    const data = await adminApi.listTypes();
    list.value = data.list || data.types || [];
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
const reload = load;

async function save() {
  if (!form.code.trim() || !form.name.trim()) {
    ElMessage.info('类型码与名称都要填');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      // 只提交非零维度，库里的 dims 保持干净
      dims: Object.fromEntries(DIM_KEYS.filter((k) => Number(form.dims[k]) !== 0).map((k) => [k, Number(form.dims[k])])),
    };
    if (editing.value) await adminApi.updateType(editing.value, payload);
    else await adminApi.createType(payload);
    ElMessage.success(editing.value ? '已保存' : '已新建');
    dialog.value = false;
    await load();
  } catch (err) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove(t) {
  try {
    await ElMessageBox.confirm(`确定删除「${t.name}」？` + (t.recommendAlbumIds?.length ? '绑定的推荐专辑会一起解绑。' : ''), '删除类型', {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    await adminApi.deleteType(t._id);
    ElMessage.success('已删除');
    await load();
  } catch (err) {
    ElMessage.error(err?.message || '删除失败');
  }
}

// —— 绑定推荐专辑 ——
const bindDialog = ref(false);
const bindTarget = ref(null);
const bindPicked = ref([]); // [{ id, albumId, name, artistName, artworkUrl, releaseDate }]
const albumTerm = ref('');
const albumResults = ref([]);
const searchingAlbums = ref(false);
const savingBind = ref(false);

function openBind(t) {
  bindTarget.value = t;
  // 回填已绑的专辑：接口可能返回完整对象（recommendAlbums）或只有 id 列表
  bindPicked.value = (t.recommendAlbums || []).map((a) => ({ ...a })) || [];
  albumTerm.value = '';
  albumResults.value = [];
  bindDialog.value = true;
  loadTagStats();
}

/* —— 用户投票汇总（闭环：用户投票 → 后台一键采纳进推荐池） —— */
const tagTop = ref([]);
const tagVoters = ref(0);
async function loadTagStats() {
  tagTop.value = [];
  tagVoters.value = 0;
  try {
    const d = await personalityApi.tagStats({ limit: 6 });
    tagVoters.value = d?.voters || 0;
    tagTop.value = (d?.byType || {})[bindTarget.value?.code] || [];
  } catch {
    /* 没有投票数据就算了，不打扰绑定流程 */
  }
}

/** 采纳：把这张用户投票选出的专辑加进当前类型的推荐（已在里面就不重复） */
async function adoptTag(a) {
  if (bindPicked.value.some((x) => x.id === a.id)) {
    ElMessage.info('这张已经在推荐里了');
    return;
  }
  bindPicked.value = [...bindPicked.value, { ...a }];
  ElMessage.success(`已加入待保存：${a.name}（记得点「保存绑定」）`);
}

function pick(a) {
  if (bindPicked.value.some((x) => x.id === a.id)) return unpick(bindPicked.value.findIndex((x) => x.id === a.id));
  if (bindPicked.value.length >= 8) {
    ElMessage.warning('最多绑 8 张，建议 3–5 张');
    return;
  }
  bindPicked.value = [...bindPicked.value, a];
}

function unpick(i) {
  bindPicked.value = bindPicked.value.filter((_, idx) => idx !== i);
}

async function searchAlbums() {
  if (!albumTerm.value.trim()) return;
  searchingAlbums.value = true;
  try {
    const data = await musicApi.searchAlbums({ term: albumTerm.value.trim(), limit: 18 });
    albumResults.value = data.list || [];
    if (!albumResults.value.length) ElMessage.info('曲库里没有匹配的专辑');
  } catch (err) {
    ElMessage.error(err?.message || '搜索失败');
  } finally {
    searchingAlbums.value = false;
  }
}

async function saveBind() {
  savingBind.value = true;
  try {
    await adminApi.updateType(bindTarget.value._id, { recommendAlbumIds: bindPicked.value.map((a) => a.id) });
    ElMessage.success(`「${bindTarget.value.name}」已绑 ${bindPicked.value.length} 张推荐专辑`);
    bindDialog.value = false;
    await load();
  } catch (err) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    savingBind.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.hdops {
  display: flex;
  gap: 10px;
  align-items: center;
}
.admhd .mini.pri {
  background: var(--brand);
  color: var(--brand-ink);
  border-color: var(--brand);
}
.dimgrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
}
.dimrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px;
  border-radius: 10px;
  background: var(--glass2);
  border: 1px solid var(--line);
  font-size: 13.5px;
}
.dimtag {
  display: inline-block;
  margin: 2px 6px 2px 0;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12.5px;
  background: var(--glass2);
  border: 1px solid var(--gbd);
  color: var(--text2);
  white-space: nowrap;
}
.srow {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.bindhint {
  font-size: 13.5px;
  color: var(--text2);
  margin: 6px 0 10px;
}
.picks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.albgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
  gap: 12px;
  max-height: 340px;
  overflow-y: auto;
  padding: 4px;
}
.albpick {
  border: 1px solid var(--gbd);
  background: var(--glass2);
  border-radius: 12px;
  padding: 8px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.albpick img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  display: block;
  background: var(--glass);
}
.albpick b {
  margin-top: 7px;
  font-size: 13.5px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.albpick span {
  display: block;
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.albpick.on {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.22);
}
.albpick.on::after {
  content: '✓ 已选';
  display: block;
  margin-top: 5px;
  font-size: 12px;
  font-weight: 700;
  color: var(--brand-deep);
}

/* 用户投票推荐块（闭环采纳） */
.tagtop {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(14, 165, 233, 0.07);
  border: 1px dashed rgba(14, 165, 233, 0.42);
}
.tt-hd b { font-size: 14.5px; }
.tt-hd span { display: block; margin: 3px 0 10px; font-size: 12.5px; color: var(--text2); }
.tt-list { display: grid; gap: 8px; }
.tt-item { display: flex; align-items: center; gap: 10px; background: var(--glass); border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; }
.tt-item img { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; flex: 0 0 auto; }
.tt-tx { flex: 1; min-width: 0; }
.tt-tx b { display: block; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt-tx span { font-size: 12.5px; color: var(--text2); }
.tt-tx em { font-style: normal; font-weight: 700; color: var(--brand-deep); }
</style>
