<template>
  <div class="container admin">
    <section class="head">
      <div>
        <p class="eyebrow">后台管理</p>
        <h1>题目管理</h1>
        <p class="muted">人格测评的题库。每道题的每个选项按维度给分，维度名用逗号分隔。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建题目</el-button>
    </section>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!list.length" class="state card empty">
      <p class="big">题库为空</p>
      <p class="muted">先建几道题，前台测评才能开始。</p>
      <el-button type="primary" @click="openCreate">新建题目</el-button>
    </div>

    <div v-else class="table-wrap card">
      <table class="tbl">
        <thead>
          <tr>
            <th>题号</th>
            <th>类型</th>
            <th>题干</th>
            <th>维度</th>
            <th>选项数</th>
            <th class="op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="q in list" :key="q.questionId">
            <td class="num">{{ q.order }}</td>
            <td><el-tag size="small" :type="q.type === 'audio' ? 'warning' : 'info'" effect="plain">{{ q.type === 'audio' ? '听感' : '选择' }}</el-tag></td>
            <td>{{ q.title }}</td>
            <td class="muted small">{{ (q.dims || []).join(' / ') }}</td>
            <td class="num">{{ (q.options || []).length }}</td>
            <td class="op">
              <el-button text type="primary" @click="openEdit(q)">编辑</el-button>
              <el-button text type="danger" @click="remove(q)">删除</el-button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <el-dialog v-model="dialog" :title="editing ? '编辑题目' : '新建题目'" width="760px" align-center @closed="resetForm">
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
          <el-input v-model="form.dimsText" placeholder="例如：energy,mood,openness" @input="syncScores" />
        </el-form-item>

        <el-form-item label="选项与打分" required>
          <div class="options">
            <div class="opt-head">
              <span class="c-key">KEY</span>
              <span class="c-label">选项文案</span>
              <span v-for="d in dims" :key="d" class="c-score">{{ d }}</span>
              <span></span>
            </div>
            <div v-for="(o, i) in form.options" :key="i" class="opt-row">
              <el-input v-model="o.key" placeholder="A" class="c-key" />
              <el-input v-model="o.label" placeholder="选项内容" class="c-label" />
              <el-input-number
                v-for="d in dims"
                :key="d"
                v-model="o.score[d]"
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
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api';

const loading = ref(true);
const list = ref([]);
const dialog = ref(false);
const editing = ref(null);
const saving = ref(false);

const form = reactive({
  order: 1,
  type: 'choice',
  title: '',
  audioRef: '',
  dimsText: '',
  options: [],
});

const dims = computed(() =>
  form.dimsText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

function syncScores() {
  for (const o of form.options) {
    const next = {};
    for (const d of dims.value) next[d] = Number(o.score?.[d] || 0);
    o.score = next;
  }
}

function addOption() {
  const score = {};
  for (const d of dims.value) score[d] = 0;
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
  form.options = (q.options || []).map((o) => ({
    key: o.key,
    label: o.label,
    score: { ...(o.score || {}) },
  }));
  dialog.value = true;
}

function buildPayload() {
  return {
    order: Number(form.order),
    type: form.type,
    title: form.title.trim(),
    audioRef: form.audioRef || null,
    dims: dims.value,
    options: form.options.map((o) => ({
      key: o.key.trim(),
      label: o.label.trim(),
      score: { ...o.score },
    })),
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
.admin {
  padding-top: var(--sp-6);
  padding-bottom: var(--sp-8);
}
.eyebrow {
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand);
}
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-4);
}
.head h1 {
  font-size: var(--fs-h1);
  margin-top: var(--sp-2);
}
.head .muted {
  margin-top: var(--sp-2);
  max-width: 560px;
}
.state {
  padding: var(--sp-6);
  text-align: center;
}
.empty {
  max-width: 460px;
  margin: var(--sp-5) auto;
}
.empty .big {
  font-size: var(--fs-h2);
  margin-bottom: var(--sp-2);
}
.table-wrap {
  padding: var(--sp-2) 0;
  overflow-x: auto;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}
.tbl th,
.tbl td {
  padding: var(--sp-3) var(--sp-4);
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.tbl th {
  color: var(--text-3);
  font-weight: 500;
}
.tbl .op {
  text-align: right;
}
.small {
  font-size: var(--fs-sm);
}
.row2 {
  display: flex;
  gap: var(--sp-4);
}
.options {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--sp-3);
}
.opt-head,
.opt-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}
.opt-head {
  color: var(--text-3);
  font-size: var(--fs-xs);
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
