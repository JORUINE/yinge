<template>
  <div class="container admin">
    <section class="head">
      <div>
        <p class="eyebrow">后台管理</p>
        <h1>人格类型管理</h1>
        <p class="muted">人格类型的库。维度分用 JSON 表示，例如 {"energy":2,"mood":-1}。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建类型</el-button>
    </section>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!list.length" class="state card empty">
      <p class="big">类型库为空</p>
      <p class="muted">先建几种人格类型，前台图鉴与测评才有内容。</p>
    </div>

    <div v-else class="grid">
      <article v-for="t in list" :key="t._id" class="card item">
        <div class="top">
          <span class="code">{{ t.code }}</span>
          <div class="op">
            <el-button text type="primary" @click="openEdit(t)">编辑</el-button>
            <el-button text type="danger" @click="remove(t)">删除</el-button>
          </div>
        </div>
        <h3>{{ t.name }}</h3>
        <p class="muted small desc">{{ t.description }}</p>
      </article>
    </div>

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
        <el-form-item label="维度分（JSON）">
          <el-input v-model="form.dimsText" type="textarea" :rows="3" placeholder='{"energy":2,"mood":-1}' />
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
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api';

const loading = ref(true);
const list = ref([]);
const dialog = ref(false);
const editing = ref(null);
const saving = ref(false);

const form = reactive({ code: '', name: '', description: '', dimsText: '{}' });

function resetForm() {
  editing.value = null;
  form.code = '';
  form.name = '';
  form.description = '';
  form.dimsText = '{}';
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
  form.dimsText = t.dims ? JSON.stringify(t.dims) : '{}';
  dialog.value = true;
}

function parseDims() {
  const txt = form.dimsText.trim() || '{}';
  try {
    const obj = JSON.parse(txt);
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new Error('必须是对象');
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] !== 'number') throw new Error(`维度 ${k} 的值必须是数字`);
    }
    return obj;
  } catch (e) {
    throw new Error('维度分 JSON 格式不正确：' + e.message);
  }
}

async function save() {
  if (!form.code.trim() || !form.name.trim() || !form.description.trim())
    return ElMessage.warning('请填写完整');
  let dims;
  try {
    dims = parseDims();
  } catch (e) {
    return ElMessage.error(e.message);
  }
  saving.value = true;
  try {
    const payload = { code: form.code.trim(), name: form.name.trim(), description: form.description.trim(), dims };
    if (editing.value) {
      await adminApi.updateType(editing.value, payload);
      ElMessage.success('已更新');
    } else {
      await adminApi.createType(payload);
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

async function remove(t) {
  try {
    await ElMessageBox.confirm(`删除类型「${t.name}」？`, '删除类型', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await adminApi.deleteType(t._id);
    ElMessage.success('已删除');
    await reload();
  } catch (err) {
    ElMessage.error(err?.message || '删除失败');
  }
}

async function reload() {
  loading.value = true;
  try {
    const data = await adminApi.listTypes();
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
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--sp-4);
}
.item {
  padding: var(--sp-4) var(--sp-5);
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-2);
}
.code {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--text-3);
}
.op {
  display: flex;
  gap: var(--sp-1);
}
.item h3 {
  font-size: var(--fs-h3);
}
.small {
  font-size: var(--fs-sm);
}
.desc {
  margin-top: var(--sp-1);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.row2 {
  display: flex;
  gap: var(--sp-4);
}
</style>
