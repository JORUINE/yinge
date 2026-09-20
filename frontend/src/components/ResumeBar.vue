<template>
  <div v-if="item" class="resumebar">
    <div class="rbcover">
      <img v-if="item.cover" :src="item.cover" alt="" />
      <span v-else class="rbph">音格</span>
    </div>
    <div class="rbtx">
      <b>你还有一局没打完</b>
      <span>
        {{ item.title || '专辑对决' }}
        <template v-if="item.total"> · 已投 {{ item.decided }} / {{ item.total }} 场</template>
      </span>
    </div>
    <RouterLink :to="{ name: 'battle-pk', params: { id: item.id } }" class="btn pri">
      接着打
    </RouterLink>
    <button class="rbno" type="button" title="不再提醒这一局" @click="dismiss">不玩了</button>
  </div>
</template>

<script setup>
/**
 * 「继续上次未完成的对决」提示条
 * ------------------------------------------------------------
 * 放在首页与创建页顶部：用户最常见的动作就是"点开始对决"，
 * 如果他手上已经有一局没打完，在这里拦一下比开完新局再后悔划算。
 *
 * 显示条件（三条都要满足）：
 *   ① localStorage 里有记录（见 utils/resume.js）
 *   ② 回服务端问过一次，这局**还没打完**（打完了就顺手把记录清掉）
 *   ③ 用户没点过「不玩了」（本次会话内不再提示）
 */
import { onMounted, ref } from 'vue';
import { battleApi } from '@/api';
import { readResume, clearResume } from '@/utils/resume.js';

const item = ref(null);
const dismissed = ref(false);

/** 局名：多位歌手用「·」连起来；没有歌手信息就退回赛制名 */
function titleOf(b) {
  const names = (b?.artists || []).map((a) => a?.name).filter(Boolean);
  if (names.length) return names.join(' · ');
  const MAP = {
    'multi-artist': '多歌手混战',
    artist: '单歌手内战',
    genre: '按流派',
    era: '按年代',
    custom: '手动挑选',
    aligned: '经典对位赛',
    duel: '指定对决',
  };
  return MAP[b?.scopeType] || '专辑对决';
}

onMounted(async () => {
  if (dismissed.value) return;
  const saved = readResume();
  if (!saved?.id) return;
  try {
    // 用 nextStep 校验：它同时给出"打完了没"和"已投 N/M"
    const data = await battleApi.nextStep(saved.id);
    if (data?.finished) {
      clearResume(); // 这局已经打完了 —— 记录过期，清掉，别再提示
      return;
    }
    item.value = {
      id: saved.id,
      title: titleOf(await battleApi.detail(saved.id)),
      cover: saved.cover || '',
      decided: data?.progress?.decided ?? 0,
      total: data?.progress?.total ?? 0,
    };
  } catch {
    // 局被删了 / 不是我的 / 服务没起 —— 都当作"没有可续的"，清掉记录即可
    clearResume();
  }
});

function dismiss() {
  dismissed.value = true;
  clearResume();
  item.value = null;
}
</script>

<style scoped>
.resumebar {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 11px 14px;
  margin-bottom: 16px;
  border-radius: 14px;
  border: 1px solid rgba(14, 165, 233, 0.34);
  background: linear-gradient(100deg, rgba(14, 165, 233, 0.14), var(--glass2) 62%);
  box-shadow: var(--shadow-2);
}
.rbcover {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  flex: 0 0 auto;
  background: linear-gradient(150deg, #7dd3fc, #0ea5e9 58%, #0369a1);
  display: grid;
  place-items: center;
}
.rbcover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.rbph {
  font-size: 15px;
  font-weight: 800;
  color: #04263c;
}
.rbtx {
  flex: 1;
  min-width: 0;
}
.rbtx b {
  display: block;
  font-size: 15px;
  letter-spacing: -0.2px;
}
.rbtx span {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  color: var(--text2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rbno {
  flex: 0 0 auto;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid var(--gbd);
  background: transparent;
  color: var(--text3);
  font-size: 13px;
  cursor: pointer;
}
.rbno:hover {
  color: var(--text);
  border-color: var(--line);
}
@media (max-width: 640px) {
  .resumebar {
    flex-wrap: wrap;
  }
}
</style>
