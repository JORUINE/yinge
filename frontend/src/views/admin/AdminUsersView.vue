<template>
  <div class="container admin">
    <section class="head">
      <div>
        <p class="eyebrow">后台管理</p>
        <h1>用户管理</h1>
        <p class="muted">查看注册用户，必要时禁用或恢复。禁用后会向前台推送原因提示。</p>
      </div>
    </section>

    <section class="card filter">
      <el-input v-model="keyword" placeholder="账号 / 昵称搜索" style="width: 220px" @keyup.enter="reload" />
      <el-select v-model="statusFilter" style="width: 130px" @change="reload">
        <el-option label="全部" value="" />
        <el-option label="正常" value="active" />
        <el-option label="已禁用" value="banned" />
      </el-select>
      <el-button @click="reload">查询</el-button>
    </section>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else class="card table-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>昵称</th>
            <th>账号</th>
            <th>角色</th>
            <th>状态</th>
            <th>违规次数</th>
            <th>注册时间</th>
            <th class="op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in list" :key="u.id">
            <td>{{ u.nickname }}</td>
            <td class="muted small">{{ u.account }}</td>
            <td><el-tag size="small" :type="u.role === 'admin' ? 'danger' : 'info'" effect="plain">{{ u.role === 'admin' ? '管理员' : '用户' }}</el-tag></td>
            <td>
              <el-tag size="small" :type="u.status === 'banned' ? 'danger' : 'success'" effect="light">
                {{ u.status === 'banned' ? '已禁用' : '正常' }}
              </el-tag>
            </td>
            <td class="num">{{ u.violationCount }}</td>
            <td class="muted small">{{ fmtDate(u.createdAt) }}</td>
            <td class="op">
              <el-button v-if="u.status !== 'banned'" text type="danger" @click="ban(u)">禁用</el-button>
              <el-button v-else text type="success" @click="unban(u)">恢复</el-button>
            </td>
          </tr>
          <tr v-if="!list.length">
            <td colspan="7" class="muted center">没有匹配的用户</td>
          </tr>
        </tbody>
      </table>
    </div>

    <el-dialog v-model="banDialog" title="禁用用户" width="460px" align-center>
      <el-form label-position="top">
        <el-form-item label="禁用原因">
          <el-select v-model="banForm.reason" style="width: 100%">
            <el-option v-for="r in bannedReasons" :key="r" :label="reasonText(r)" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="判定说明（可选）">
          <el-input v-model="banForm.note" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="banDialog = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="confirmBan">确认禁用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '@/api';
import { fmtDate } from '@/utils/labels';

const loading = ref(true);
const list = ref([]);
const keyword = ref('');
const statusFilter = ref('');
const bannedReasons = ref([]);
const banDialog = ref(false);
const saving = ref(false);
const target = ref(null);
const banForm = ref({ reason: 'vote_fraud', note: '' });

const REASON_TEXT = {
  vote_fraud: '刷票行为',
  spam_content: '违规内容',
  abuse_request: '高频调用接口',
  self_request: '用户申请注销',
  appeal_overturned: '误判申诉成立',
};
function reasonText(code) {
  return REASON_TEXT[code] || code;
}

async function reload() {
  loading.value = true;
  try {
    const params = { pageSize: 100 };
    if (keyword.value.trim()) params.keyword = keyword.value.trim();
    if (statusFilter.value) params.status = statusFilter.value;
    const data = await adminApi.listUsers(params);
    list.value = data.list || [];
    bannedReasons.value = data.bannedReasons || [];
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function ban(u) {
  target.value = u;
  banForm.value = { reason: 'vote_fraud', note: '' };
  banDialog.value = true;
}
async function confirmBan() {
  saving.value = true;
  try {
    await adminApi.updateUserStatus(target.value.id, {
      status: 'banned',
      bannedReason: banForm.value.reason,
      bannedNote: banForm.value.note || null,
    });
    ElMessage.success('已禁用');
    banDialog.value = false;
    await reload();
  } catch (err) {
    ElMessage.error(err?.message || '操作失败');
  } finally {
    saving.value = false;
  }
}
async function unban(u) {
  try {
    await adminApi.updateUserStatus(u.id, { status: 'active' });
    ElMessage.success('已恢复');
    await reload();
  } catch (err) {
    ElMessage.error(err?.message || '操作失败');
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
  margin-bottom: var(--sp-5);
}
.head h1 {
  font-size: var(--fs-h1);
  margin-top: var(--sp-2);
}
.head .muted {
  margin-top: var(--sp-2);
  max-width: 600px;
}
.filter {
  padding: var(--sp-4) var(--sp-5);
  margin-bottom: var(--sp-5);
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.table-wrap {
  padding: var(--sp-4) var(--sp-5);
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}
.tbl th,
.tbl td {
  padding: var(--sp-3) var(--sp-2);
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
.center {
  text-align: center;
  padding: var(--sp-5);
}
.state {
  padding: var(--sp-5);
  text-align: center;
}
</style>
