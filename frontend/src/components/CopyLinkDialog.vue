<!--
  复制链接兜底弹窗（共用组件 · 第六十四批抽出）
  ============================================================
  什么时候出现：`copyText()` 的两条路（execCommand / Clipboard API）都失败时。
  真机场景：局域网 http + 某些安卓 WebView / 微信内置浏览器。

  为什么必须"可长按选中"：写不进剪贴板时，用户唯一能自救的路径就是
  长按输入框 → 系统菜单「拷贝」。所以用 readonly `<input>`（不是 div），
  并且挂载后立刻 focus + select。

  ⚠️ 字号 16px 不能改小：iOS 上输入框 <16px 会在聚焦时把整个页面放大。
-->
<template>
  <div class="copymask" @click.self="$emit('close')">
    <div class="copybox" role="dialog" aria-modal="true" aria-label="复制链接">
      <b>复制链接</b>
      <p>这台设备不允许网页直接写剪贴板。链接已选中，长按后点「拷贝」即可。</p>
      <input
        ref="inputEl"
        class="copyinput"
        :value="url"
        readonly
        @focus="$event.target.select()"
        @click="$event.target.select()"
      />
      <div class="copybtns">
        <button class="btn ghost" type="button" @click="retry">再试一次</button>
        <button class="btn pri" type="button" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { copyByExecCommand, copyText } from '@/utils/clipboard.js';

const props = defineProps({
  /** 要复制的链接 */
  url: { type: String, default: '' },
});
const emit = defineEmits(['close', 'copied']);

const inputEl = ref(null);

onMounted(async () => {
  await nextTick();
  inputEl.value?.focus();
  inputEl.value?.select();
});

/** 用户再点一次「再试一次」：两条路都重跑一遍（可能刚才只是手势丢了） */
async function retry() {
  const r = await copyText(props.url);
  if (r.ok) {
    ElMessage.success('链接已复制');
    emit('copied');
    emit('close');
    return;
  }
  if (copyByExecCommand(props.url)) {
    ElMessage.success('链接已复制');
    emit('copied');
    emit('close');
    return;
  }
  // 还是不行：保持弹窗，重新全选，让用户长按
  inputEl.value?.focus();
  inputEl.value?.select();
  ElMessage.warning('这台设备仍不允许写入，请长按上面的链接手动拷贝');
}
</script>

<style scoped>
.copymask {
  position: fixed;
  inset: 0;
  z-index: 3000; /* 高过手机底部导航（1000）与 Element message（2000） */
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(6, 22, 34, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.copybox {
  width: min(460px, 100%);
  background: #fff;
  color: #0f2434;
  border-radius: 18px;
  padding: 20px 20px 16px;
  box-shadow: 0 24px 60px rgba(3, 18, 28, 0.35);
  display: grid;
  gap: 10px;
}
.copybox b {
  font-size: 17px;
}
.copybox p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: #3d5a6e;
}
.copyinput {
  width: 100%;
  padding: 11px 12px;
  font-size: 16px; /* iOS：<16px 聚焦会放大页面，不能改小 */
  line-height: 1.5;
  border: 1px solid #cfe0ea;
  border-radius: 10px;
  background: #f4f9fc;
  color: #0b4a6f;
  font-variant-numeric: tabular-nums;
}
.copybtns {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}
@media (max-width: 480px) {
  .copybtns {
    flex-direction: column-reverse;
  }
  .copybtns .btn {
    width: 100%;
  }
}
</style>
