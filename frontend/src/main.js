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
 * ⚠️ Edge(Windows)「最小化 / 回到桌面」时窗口一直闪/切，三轮排查的结论：
 *    页面侧的合成层（毛玻璃 backdrop-filter、大范围 filter: blur、固定全屏层、
 *    混合模式、动画）**能让 Chromium 合成器持续重绘**，是放大器（crbug 1202369 / 483220231）；
 *    另外 Windows 上还有一个**窗口级**因素：启动器留下的黑色控制台窗一直停在前台，
 *    最小化浏览器时"接住"焦点的是它 —— 表现就是"点最小化一直切、回不到桌面"
 *    （UI 原型是双击 html 打开的，没有黑窗，所以从来不复现）。这一条已在 start-dev.bat 修掉：
 *    两个日志窗 /min 启动、启动器自身 5 秒后自动退出。
 * 三档降级（只影响观感，不动功能），页脚有一键切换 + 逐项自检读数：
 *   · auto（默认）：Edge 自动 → html.ua-edge
 *   · lite（稳定模式）→ html.ua-lite：极光层不渲染、毛玻璃与 filter 全关
 *   · safe（极简模式）→ html.ua-safe：连阴影/过渡/装饰覆盖层一起关，只剩纯静态版式
 *   · 想强制保留毛玻璃：?glass=1
 */
(function applyCompatMode() {
  const root = document.documentElement;
  // Edge 判定：UA 里的 Edg/ 之外，再看 Chromium 的 brands（更稳）
  const ua = navigator.userAgent || '';
  const brands = navigator.userAgentData?.brands || [];
  const isEdge = /Edg[A-Za-z]*\//.test(ua) || brands.some((b) => /Microsoft Edge/i.test(b.brand || ''));
  let q = null;
  try {
    q = new URLSearchParams(window.location.search);
  } catch {
    q = null;
  }
  try {
    // 新的三档开关（兼容老的 yinge_lite）
    if (q?.get('compat')) localStorage.setItem('yinge_compat', q.get('compat'));
    if (q?.get('lite') === '1') localStorage.setItem('yinge_compat', 'lite');
    else if (q?.get('lite') === '0') localStorage.removeItem('yinge_compat');
    if (q?.get('glass') === '1') localStorage.setItem('yinge_force_glass', '1');
    else if (q?.get('glass') === '0') localStorage.removeItem('yinge_force_glass');
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略即可 */
  }
  let compat = 'auto';
  let forceGlass = false;
  try {
    // 老用户可能还存着 yinge_lite=1 → 迁移成 lite
    if (localStorage.getItem('yinge_lite') === '1' && !localStorage.getItem('yinge_compat')) {
      localStorage.setItem('yinge_compat', 'lite');
      localStorage.removeItem('yinge_lite');
    }
    compat = localStorage.getItem('yinge_compat') || 'auto';
    forceGlass = localStorage.getItem('yinge_force_glass') === '1';
  } catch {
    compat = 'auto';
    forceGlass = false;
  }
  if (isEdge && !forceGlass) root.classList.add('ua-edge');
  if (compat === 'lite' || compat === 'safe') root.classList.add('ua-lite');
  if (compat === 'safe') root.classList.add('ua-safe');
  root.dataset.compat = forceGlass ? 'glass' : compat;
})();

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: zhCn });

app.mount('#app');
