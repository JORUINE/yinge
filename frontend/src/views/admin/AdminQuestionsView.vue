<template>
  <AdminShell>
    <div class="admhd">
      <div>
        <h3>题目管理</h3>
        <p>人格测评题库。每个选项按维度给分（维度为 melody / rhythm / arrangement / calm）。</p>
      </div>
      <button class="mini" type="button" @click="openCreate">+ 新建题目</button>
    </div>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!list.length" class="state g-card">
      <h4>题库为空</h4>
      <p class="muted">先建几道题，前台测评才能开始。</p>
      <button class="btn pri sm" type="button" @click="openCreate">新建题目</button>
    </div>

    <table v-else class="tbl">
      <thead>
        <tr>
          <th style="width: 56px">题号</th>
          <th style="width: 74px">类型</th>
          <th>题干</th>
          <th style="width: 200px">维度</th>
          <th style="width: 64px">选项</th>
          <th class="act" style="width: 130px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="q in list" :key="q.questionId">
          <td class="num">{{ q.order }}</td>
          <td>
            <span class="tagx" :class="q.type === 'audio' ? 'wn' : 'tp'">{{ q.type === 'audio' ? '听感' : '选择' }}</span>
          </td>
          <td class="ell">{{ q.title }}</td>
          <td class="dim">{{ (q.dims || []).join(' / ') }}</td>
          <td class="num">{{ (q.options || []).length }}</td>
          <td class="act">
            <button class="mini" type="button" @click="openEdit(q)">编辑</button>
            <button class="mini" type="button" @click="remove(q)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <el-dialog v-model="dialog" :title="editing ? '编辑题目' : '新建题目'" width="780px" align-center @closed="resetForm">
      <el-form :model="form" label-position="top">
        <div class="row2">
          <el-form-item label="题号" required>
            <el-input-number v-model="form.order" :min="1" controls-position="right" />
          </el-form-item>
          <el-form-item label="类型">
            <el-select v-model="form.type" style="width: 160px">
              <el-option label="选择题" value="choice" />
              <el-option label="听感题" value="audio" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="题干" required>
          <el-input v-model="form.title" placeholder="例如：你更常在什么场景打开音乐？" />
        </el-form-item>
        <el-form-item v-if="form.type === 'audio'" label="音频参考（可选）">
          <el-input v-model="form.audioRef" placeholder="音频标识或链接" />
        </el-form-item>
        <el-form-item label="维度（逗号分隔）" required>
          <el-input v-model="form.dimsText" placeholder="例如：melody,rhythm" @input="syncScores" />
        </el-form-item>

        <el-form-item label="选项与打分" required>
          <div class="options">
            <div class="opt-head">
              <span class="c-key">KEY</span>
              <span class="c-label">选项文案</span>
              <span v-for="dd in dims" :key="dd" class="c-score">{{ dd }}</span>
              <span></span>
            </div>
            <div v-for="(o, i) in form.options" :key="i" class="opt-row">
              <el-input v-model="o.key" placeholder="A" class="c-key" />
              <el-input v-model="o.label" placeholder="选项内容" class="c-label" />
              <el-input-number
                v-for="dd in dims"
                :key="dd"
                v-model="o.score[dd]"
                :min="-5"
                :max="5"
                controls-position="right"
                class="c-score"
              />
              <el-button text type="danger" @click="removeOption(i)">×</el-button>
            </div>
            <el-button text type="primary" @click="addOption">+ 添加选项</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </AdminShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api';
import AdminShell from '@/layouts/AdminShell.vue';

const loading = ref(true);
const list = ref([]);
const dialog = ref(false);
const editing = ref(null);
const saving = ref(false);

const form = reactive({ order: 1, type: 'choice', title: '', audioRef: '', dimsText: '', options: [] });

const dims = computed(() =>
  form.dimsText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

function syncScores() {
  for (const o of form.options) {
    const next = {};
    for (const dd of dims.value) next[dd] = Number(o.score?.[dd] || 0);
    o.score = next;
  }
}

function addOption() {
  const score = {};
  for (const dd of dims.value) score[dd] = 0;
  form.options.push({ key: '', label: '', score });
}
function removeOption(i) {
  form.options.splice(i, 1);
}

function resetForm() {
  editing.value = null;
  form.order = 1;
  form.type = 'choice';
  form.title = '';
  form.audioRef = '';
  form.dimsText = '';
  form.options = [];
}

function openCreate() {
  resetForm();
  dialog.value = true;
}

function openEdit(q) {
  editing.value = q.questionId;
  form.order = q.order;
  form.type = q.type || 'choice';
  form.title = q.title;
  form.audioRef = q.audioRef || '';
  form.dimsText = (q.dims || []).join(', ');
  form.options = (q.options || []).map((o) => ({ key: o.key, label: o.label, score: { ...(o.score || {}) } }));
  dialog.value = true;
}

function buildPayload() {
  return {
    order: Number(form.order),
    type: form.type,
    title: form.title.trim(),
    audioRef: form.audioRef || null,
    dims: dims.value,
    options: form.options.map((o) => ({ key: o.key.trim(), label: o.label.trim(), score: { ...o.score } })),
  };
}

async function save() {
  if (!form.title.trim()) return ElMessage.warning('请填写题干');
  if (!dims.value.length) return ElMessage.warning('请填写至少一个维度');
  if (form.options.length < 2) return ElMessage.warning('至少两个选项');
  for (const o of form.options) {
    if (!o.key.trim() || !o.label.trim()) return ElMessage.warning('选项 KEY 和文案都不能为空');
  }
  saving.value = true;
  try {
    const payload = buildPayload();
    if (editing.value) {
      await adminApi.updateQuestion(editing.value, payload);
      ElMessage.success('已更新');
    } else {
      await adminApi.createQuestion(payload);
      ElMessage.success('已创建');
    }
    dialog.value = false;
    await reload();
  } catch (err) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove(q) {
  try {
    await ElMessageBox.confirm(`删除题目「${q.title}」？`, '删除题目', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await adminApi.deleteQuestion(q.questionId);
    ElMessage.success('已删除');
    await reload();
  } catch (err) {
    ElMessage.error(err?.message || '删除失败');
  }
}

async function reload() {
  loading.value = true;
  try {
    const data = await adminApi.listQuestions();
    list.value = data.list || [];
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.state {
  padding: 24px;
  text-align: center;
}
.state h4 {
  margin: 0 0 6px;
}
.dim {
  font-size: 12px;
  color: var(--text3);
}
.row2 {
  display: flex;
  gap: 16px;
}
.options {
  border: 1px solid var(--gbd);
  border-radius: var(--r-s);
  padding: 10px;
  width: 100%;
}
.opt-head,
.opt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.opt-head {
  color: var(--text3);
  font-size: 11px;
}
.c-key {
  width: 64px;
}
.c-label {
  flex: 1;
  min-width: 120px;
}
.c-score {
  width: 92px;
}
</style>
