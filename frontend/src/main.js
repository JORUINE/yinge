import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';

import App from './App.vue';
import router from './router/index.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

/**
 * 浏览器兼容降级（在挂载前挂类名，避免首帧闪烁）
 * ------------------------------------------------------------
 * ⚠️ Edge(Windows)「最小化 / 回到桌面」时，页面里大量的 backdrop-filter
 *    叠上固定层大范围 filter: blur(100px)，会让 Chromium 合成器持续重绘 ——
 *    表现为整个窗口一直闪、回不到桌面（Chrome 不复现）。
 * 两级降级（只影响观感，不动功能）：
 *   · Edge 自动 → html.ua-edge：关掉毛玻璃、降低大 blur、玻璃调不透一点
 *   · 还闪 → 网址后加 ?lite=1 → html.ua-lite：连极光背景一起关掉（最强兜底）
 *   · 想强制保留毛玻璃：?glass=1
 */
(function applyCompatMode() {
  const root = document.documentElement;
  const isEdge = /Edg\//.test(navigator.userAgent || '');
  let q = null;
  try {
    q = new URLSearchParams(window.location.search);
  } catch {
    q = null;
  }
  try {
    if (q?.get('lite') === '1') localStorage.setItem('yinge_lite', '1');
    else if (q?.get('lite') === '0') localStorage.removeItem('yinge_lite');
    if (q?.get('glass') === '1') localStorage.setItem('yinge_force_glass', '1');
    else if (q?.get('glass') === '0') localStorage.removeItem('yinge_force_glass');
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略即可 */
  }
  let lite = false;
  let forceGlass = false;
  try {
    lite = localStorage.getItem('yinge_lite') === '1';
    forceGlass = localStorage.getItem('yinge_force_glass') === '1';
  } catch {
    lite = false;
    forceGlass = false;
  }
  if (isEdge && !forceGlass) root.classList.add('ua-edge');
  if (lite) root.classList.add('ua-lite');
})();

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: zhCn });

app.mount('#app');
