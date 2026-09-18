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
          <th style="width: 110px">每位张数</th>
          <th style="width: 100px">来源</th>
          <th class="act" style="width: 150px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in list" :key="c.comboId">
          <td class="ell">{{ c.label }}</td>
          <td class="ell">{{ (c.artists || []).map((a) => a.name).join(' × ') || '—' }}</td>
          <td class="num">{{ c.perArtist }}</td>
          <td>
            <span class="tagx" :class="c.isSystem ? 'tp' : 'wn'">{{ c.isSystem ? '系统' : '用户自建' }}</span>
          </td>
          <td class="act">
            <template v-if="c.isSystem">
              <button class="mini" type="button" @click="openRename(c)">改名</button>
              <button class="mini" type="button" @click="removeCombo(c)">删除</button>
            </template>
            <span v-else class="muted">（只读）</span>
          </td>
        </tr>
      </tbody>
    </table>

    <el-dialog
      v-model="dialog"
      :title="editing ? '给组合改名' : '新建系统组合'"
      width="560px"
      align-center
    >
      <div v-if="editing" class="frow">
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
          <label>每位歌手几张</label>
          <el-input-number v-model="perArtist" :min="4" :max="50" />
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
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import AdminShell from '@/layouts/AdminShell.vue';
import { comboApi, musicApi } from '@/api';

const loading = ref(true);
const saving = ref(false);
const searching = ref(false);
const list = ref([]);

const dialog = ref(false);
const editing = ref(null); // 非空 = 改名模式
const label = ref('');
const perArtist = ref(8);
const term = ref('');
const candidates = ref([]);
const artists = ref([]);

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
  editing.value = null;
  label.value = '';
  perArtist.value = 8;
  term.value = '';
  candidates.value = [];
  artists.value = [];
  dialog.value = true;
}

function openRename(c) {
  editing.value = c;
  label.value = c.label;
  dialog.value = true;
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
    if (editing.value) {
      await comboApi.update(editing.value.comboId, { label: label.value.trim() });
      ElMessage.success('已改名');
    } else {
      if (artists.value.length < 2) {
        ElMessage.info('至少加入 2 位歌手');
        saving.value = false;
        return;
      }
      await comboApi.create({
        label: label.value.trim(),
        isSystem: true, // 管理员 → 系统组合
        scopeType: 'multi-artist',
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

onMounted(load);
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
</style>
