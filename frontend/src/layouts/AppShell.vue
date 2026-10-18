<template>
  <!-- 极光背景：与设计稿 .aurora 一致，fixed 铺满、内容在其上 -->
  <div class="aurora" aria-hidden="true">
    <div class="blob b1"></div>
    <div class="blob b2"></div>
    <div class="blob b3"></div>
    <div class="ray r1"></div>
    <div class="ray r2"></div>
  </div>

  <div class="shell">
    <header v-if="!isAdmin" class="topbar">
      <div class="container bar">
        <button v-if="showBack" class="back" type="button" @click="goBack" title="返回">
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
          <span>返回</span>
        </button>
        <nav class="nav-inline">
          <RouterLink to="/" class="logo">音<i>格</i></RouterLink>
          <RouterLink to="/battle/create" active-class="on">专辑对决</RouterLink>
          <RouterLink to="/personality" active-class="on">音乐人格</RouterLink>
          <RouterLink to="/rank" active-class="on">排行榜</RouterLink>
          <RouterLink to="/personality/types" active-class="on">人格图鉴</RouterLink>
          <RouterLink v-if="auth.isLoggedIn" to="/battle/mine" active-class="on">我的对决</RouterLink>
          <RouterLink v-if="auth.isLoggedIn" to="/favorites" active-class="on">我的收藏</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin" active-class="on">管理后台</RouterLink>
        </nav>

        <div class="right">
          <template v-if="auth.isLoggedIn">
            <RouterLink
              v-if="auth.isGuest"
              to="/login"
              class="guest-tag"
              title="游客身份：对决数据只保存在本机浏览器，注册后才能收藏与长期保留"
            >
              游客 · 注册
            </RouterLink>
            <RouterLink to="/profile" class="me" :title="auth.nickname || '个人中心'">
              {{ avatarChar }}
            </RouterLink>
            <a class="quit" @click="onLogout">退出</a>
          </template>
          <RouterLink v-else to="/login" class="btn pri sm">登录 / 注册</RouterLink>
        </div>
      </div>
    </header>

    <!-- 游客醒目提醒：不注册也能玩全部主线；但游客数据只留本机，注册后可云同步
         ⚠️ 2026-10-18 第四十七批：用户原话「游客模式的提醒 做的太丑了 排布也不好看」。
         手机档改成**卡片两行**（标签+按钮两端对齐 / 下面一句话说明）；
         **桌面档保持原来的一行三段**（不渲染卡片结构 ⇒ 同输入 A/B 仍 0 差异）。 -->
    <div v-if="!isAdmin && auth.isLoggedIn && auth.isGuest" class="guestbar">
      <div class="container">
        <!-- 手机档：卡片两行 -->
        <div v-if="isPhone" class="guestcard">
          <div class="gtop">
            <span class="gt">游客模式</span>
            <RouterLink to="/login" class="btn pri sm">注册 / 登录</RouterLink>
          </div>
          <p class="gm">
            完整玩法都能玩。但<b>数据只存在这台设备</b>：换设备或清缓存会丢，<b>也不计入排行榜</b>。
          </p>
        </div>
        <!-- 桌面档：一行三段（与改前完全一致） -->
        <template v-else>
          <span class="gt">游客模式</span>
          <span class="gm">
            不注册也能玩全部主线玩法。但<b>游客数据只保存在这台设备的浏览器里</b>（换设备 / 清缓存会丢），也不计入排行榜；
            注册后可云同步、收藏专辑、上榜。
          </span>
          <RouterLink to="/login" class="btn pri sm">注册 / 登录</RouterLink>
        </template>
      </div>
    </div>

    <main class="main">
      <div class="container">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </div>
    </main>

    <footer v-if="!isAdmin" class="foot">
      <div class="container">
        音格 · 专辑对决与音乐人格测评　|　试听与封面数据来自 iTunes Search API（免登录，30 秒片段）
        <span v-if="isEdge" class="edgecompat">
          <button
            class="edgetoggle"
            type="button"
            :title="'Edge 上如果还闪屏，就往下切一档：完整 → 稳定（关毛玻璃/模糊/极光）→ 极简（连阴影动效一起关）'"
            @click="cycleCompat"
          >
            视效：{{ compatLabel }} · 点击切换
          </button>
          <em class="edgediag" :class="{ clean: diagClean }" :title="diag.bigFixedWho">
            GPU 自检：毛玻璃 {{ diag.glass }} · 滤镜 {{ diag.blur }} · 动画 {{ diag.anim }} · 混合
            {{ diag.blend }} · 全屏固定层 {{ diag.bigFixed }}
          </em>
        </span>
      </div>
    </footer>

    <!-- ⭐ 手机端底部 Tab（P0-4 分端导航，2026-10-15 用户拍板："手机用底部、桌面用顶部"）
         -----------------------------------------------------------------------------
         为什么分端而不是"一套导航适应两端"：手机上顶部导航离拇指最远、且一行放不下 7 个链接
         （实测 375 宽下顶栏链接被 CSS 隐藏后，导航入口等于没了）；底部是拇指自然落点。
         桌面端保持原有顶部导航一字不动 —— 这条底栏在 >640 时 `display:none`，
         由 `probe-r40-desktop-ab.mjs` 逐元素证明桌面端零影响。
         ⚠️ 后台（/admin）不需要它 —— 后台是桌面场景。 -->
    <nav v-if="!isAdmin" class="tabbar" aria-label="主导航">
      <RouterLink
        v-for="t in TABS"
        :key="t.to"
        :to="t.to"
        class="tabitem"
        :class="{ on: tabActive(t) }"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="t.d" /></svg>
        <span>{{ t.label }}</span>
      </RouterLink>
    </nav>

    <el-dialog v-model="bannedVisible" title="账号已被禁用" width="420px" align-center>
      <p class="banned-line">
        你的账号当前处于禁用状态，暂时无法登录与投票。数据仍完整保留。
      </p>
      <p v-if="bannedReason" class="banned-line">
        <strong>禁用原因：</strong>{{ reasonText(bannedReason) }}
      </p>
      <p v-if="bannedNote" class="banned-line"><strong>判定说明：</strong>{{ bannedNote }}</p>
      <template #footer>
        <el-button @click="bannedVisible = false">我知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useFavoritesStore } from '@/stores/favorites';
import { registerAuthHandlers } from '@/api/client';

const auth = useAuthStore();
const fav = useFavoritesStore();
const router = useRouter();
const route = useRoute();

/**
 * 进入站点 / 登录状态变化时，把「我的收藏」拉一次。
 * ------------------------------------------------------------
 * ⚠️ 以前只靠每个收藏按钮自己 onMounted 拉，页面刚打开时按钮一律显示"未收藏"；
 * 这时点下去会重复提交 → 后端撞唯一索引 → 弹「记录已存在，请勿重复操作」红字，
 * 而且图标也不会变（用户报的两个现象）。这里改成进入即拉一次。
 */
watch(
  () => auth.isLoggedIn,
  (yes) => {
    if (yes) fav.load(true);
  },
  { immediate: true },
);

/** 后台自带 chrome：/admin 下不渲染站点顶栏与页脚 */
const isAdmin = computed(() => route.path.startsWith('/admin'));

/**
 * 是否手机档（≤640）—— 只用来决定"游客条用哪套 DOM"。
 * ⚠️ 为什么必须用 JS 分两套模板而不是纯 CSS：
 *   桌面端原本是"一行三段"（标签 + 长说明 + 按钮），手机端被我改成"卡片两行"（多两层元素）。
 *   如果两套都渲染、只用 CSS 切换，桌面端 DOM 会多 3 个节点 ⇒ 同输入 A/B 直接报 897 项差异
 *   （实测踩过，2026-10-18 第四十七批）。
 *   ⇒ 桌面端**根本不渲染**手机那套，A/B 才能保 0。
 */
const isPhone = ref(false);
let mqPhone = null;

const bannedVisible = ref(false);
const bannedReason = ref(null);
const bannedNote = ref(null);

const avatarChar = computed(() => (auth.nickname || '音').slice(0, 1));

/**
 * 手机端底部 Tab（P0-4）
 * ------------------------------------------------------------
 * 5 个入口，与桌面顶部导航**指向完全相同的路由**，只是换了落点。
 * 图标统一 24×24 描边风格（fill:none / stroke:currentColor），跟项目里其它图标一致。
 * `to` 用前缀匹配（`/battle/create` 也覆盖 `/battle/mine` 之外的对战路径）。
 */
const TABS = [
  { to: '/', label: '首页', exact: true, d: 'M3 11.2 12 4l9 7.2M5.5 10.2V20h13v-9.8' },
  { to: '/battle/create', label: '对决', d: 'M3.5 6.5h6.5v11H3.5zM14 6.5h6.5v11H14z' },
  { to: '/personality', label: '人格', d: 'M12 3.5l2.2 5.1 5.3.6-3.9 3.6 1.1 5.2L12 15.4l-4.7 2.6 1.1-5.2L4.5 9.2l5.3-.6z' },
  { to: '/rank', label: '排行', d: 'M5 20V11M12 20V4M19 20v-6' },
  { to: '/profile', label: '我的', d: 'M12 12.5a4 4 0 100-8 4 4 0 000 8zM4.5 21a7.5 7.5 0 0115 0' },
];
function tabActive(t) {
  const p = route.path;
  if (t.exact) return p === t.to;
  // 「人格」要同时覆盖 /personality/*（图鉴、测评、结果都在这一支）
  if (t.to === '/personality') return p.startsWith('/personality');
  // 「对决」要覆盖 /battle/*（进行中、结果、分享）
  if (t.to === '/battle/create') return p.startsWith('/battle');
  return p.startsWith(t.to);
}

/**
 * 全站返回按钮（守则 21：各个层级界面都没有返回按钮）
 * ------------------------------------------------------------
 * 二级 / 三级页才显示。有上一页历史 → 真回退一步；
 * 没有历史（比如直接粘贴链接进来）→ 退回逻辑父路由，避免"点了没反应"。
 */
const BACK_FALLBACK = {
  'battle-play': { name: 'battle-mine' },
  'battle-pk': { name: 'battle-create' },
  'battle-bracket': { name: 'battle-mine' },
  'battle-result': { name: 'battle-mine' },
  'battle-share': { name: 'battle-mine' },
  'personality-test': { name: 'personality-intro' },
  'personality-result': { name: 'personality-intro' },
  'personality-type': { name: 'personality-types' },
  'admin-login': { name: 'home' },
};
const showBack = computed(() => Boolean(BACK_FALLBACK[route.name]));

function goBack() {
  if (window.history.state?.back) router.back();
  else router.push(BACK_FALLBACK[route.name] || { name: 'home' });
}

const REASON_TEXT = {
  vote_fraud: '刷票行为',
  spam_content: '昵称或账号名含违规内容',
  abuse_request: '绕过前端高频调用接口',
  self_request: '用户本人申请注销',
  appeal_overturned: '误判申诉成立',
};

function reasonText(code) {
  return REASON_TEXT[code] || code;
}

onMounted(() => {
  registerAuthHandlers({
    onUnauthorized: () => {
      auth.clear();
      fav.reset();
      router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
    },
    onBanned: (detail) => {
      bannedReason.value = detail?.bannedReason || null;
      bannedNote.value = detail?.bannedNote || null;
      bannedVisible.value = true;
      auth.clear();
    },
  });
  if (auth.token) auth.fetchMe();
});

async function onLogout() {
  await auth.logout();
  fav.reset();
  router.push({ name: 'home' });
}

/**
 * Edge 兼容档位 + GPU 自检（2026-09-19 第三轮）
 * ------------------------------------------------------------
 * 三档：完整（auto）→ 稳定（lite：极光不渲染 + 毛玻璃/滤镜全关）
 *       → 极简（safe：连阴影/过渡/装饰覆盖层都关，只剩纯静态版式）
 * 一键切换、存 localStorage、刷新生效。只在 Edge 显示，Chrome 等看不到。
 * 旁边的自检读数会数出**当前页面还有多少元素在吃 GPU**：
 *   毛玻璃 / 滤镜 / 动画 / 混合模式 / 固定层 —— 全 0 就说明页面侧已经彻底安静，
 *   这时若还闪，问题就不在页面上（窗口层或显卡驱动层）。
 * 另外 Windows 上启动器留下的黑窗停在前台会"接住"焦点（已改 start-dev.bat：
 *   两个日志窗 /min、启动器 5 秒后自动退出）。
 */
const isEdge = Boolean(document.documentElement.classList.contains('ua-edge'));
const compat = ref(document.documentElement.dataset.compat || 'auto');
const diag = ref({ glass: 0, blur: 0, anim: 0, blend: 0, bigFixed: 0, bigFixedWho: '' });
const COMPAT_LABEL = { auto: '完整', glass: '强制完整', lite: '稳定', safe: '极简' };
const compatLabel = computed(() => COMPAT_LABEL[compat.value] || '完整');
const diagClean = computed(
  () =>
    diag.value.glass + diag.value.blur + diag.value.anim + diag.value.blend + diag.value.bigFixed === 0,
);

function cycleCompat() {
  const order = ['auto', 'lite', 'safe'];
  const next = order[(order.indexOf(compat.value) + 1) % order.length];
  try {
    localStorage.setItem('yinge_compat', next);
  } catch {
    /* 隐私模式忽略 */
  }
  location.reload();
}

/** 逐项数一遍"还有多少元素在吃 GPU"（只在 Edge 上、进页面 1.5 秒后跑一次）
 *  ⚠️ 固定层只数**大面积**的（≥40% 视口）：Chromium 合成器的老毛病（crbug 483220231）
 *  是"铺满视口的合成层"被整层丢弃，一个小 toast 的 fixed 不影响；把 toast 也算进去
 *  会让读数永远不为 0，反而看不出真问题。
 */
function runCompatDiag() {
  let glass = 0;
  let blur = 0;
  let anim = 0;
  let blend = 0;
  let bigFixed = 0;
  let bigFixedWho = '';
  const vp = window.innerWidth * window.innerHeight || 1;
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.backdropFilter && cs.backdropFilter !== 'none') glass += 1;
    if (cs.filter && cs.filter !== 'none') blur += 1;
    if (cs.animationName && cs.animationName !== 'none') anim += 1;
    if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') blend += 1;
    if (cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden') {
      const r = el.getBoundingClientRect();
      if ((r.width * r.height) / vp >= 0.4) {
        bigFixed += 1;
        bigFixedWho = `${el.tagName.toLowerCase()}.${String(el.className || '').slice(0, 30)}`;
      }
    }
  }
  diag.value = { glass, blur, anim, blend, bigFixed, bigFixedWho };
}

onMounted(() => {
  if (isEdge) window.setTimeout(runCompatDiag, 1500);
  // 手机档判定（决定游客条用哪套 DOM，见 isPhone 注释）
  mqPhone = window.matchMedia('(max-width: 640px)');
  isPhone.value = mqPhone.matches;
  mqPhone.addEventListener?.('change', (e) => { isPhone.value = e.matches; });
});
</script>

<style scoped>
.shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--glass);
  backdrop-filter: blur(22px) saturate(180%);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  /**
   * ⚠️ 2026-09-24 第十三批（用户："ui 线条感太重 分割线太明显 必须做雾化过度处理 体现玻璃质感"）：
   *   原来是 `border-bottom: 1px solid var(--gbd)` —— `--gbd` 是接近**纯白**的玻璃描边，
   *   铺在浅色页面上就是顶栏底下一条**亮硬线**（全站每一页都有）。
   *   现在改成"两端渐隐的柔光细线"（伪元素画 1px 高的渐变，左右 12% 淡出），
   *   顶栏与内容之间只留一道过渡，不再是一条切割线。
   */
  border-bottom: 0;
}
.topbar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent 0%, var(--hair) 12%, var(--hair) 88%, transparent 100%);
}

.bar {
  height: var(--header-h);
  display: flex;
  align-items: center;
  gap: var(--sp-5);
}

/* 全站返回按钮（守则 21）：只在二级 / 三级页出现
   2026-09-21 用户："返回按钮整体往左拉长做大一点" —— 原来 13.5px 的小胶囊太不起眼，
   现在加高加宽（字号 15px、图标 17px、min-width 96px、内边距拉开），
   并把"往左"做实：它是导航栏第一个元素，加大后视觉锚点自然落在最左侧。 */
.back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 0 0 auto;
  min-width: 96px;
  padding: 9px 18px 9px 14px;
  border-radius: 999px;
  border: 1px solid var(--gbd);
  background: var(--glass2);
  box-shadow: var(--shadow-1);
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, transform 0.18s var(--ease-out), box-shadow 0.18s;
}
.back:hover {
  color: var(--brand-deep);
  border-color: var(--brand);
  transform: translateX(-2px);
  box-shadow: var(--shadow-2);
}
.back svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@media (prefers-reduced-motion: reduce) {
  .back:hover {
    transform: none;
  }
}

/* 与设计稿 .nav 一致：左 logo + 链接，右头像 */
.nav-inline {
  display: flex;
  align-items: center;
  gap: 22px;
}

.logo {
  font-weight: 700;
  font-size: 17px;
  color: var(--text);
}
.logo i {
  color: var(--brand);
  font-style: normal;
}

.nav-inline a {
  font-size: 14.5px;
  color: var(--text2);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}
.nav-inline a:hover {
  color: var(--brand-deep);
}
.nav-inline a.on {
  color: var(--text);
  font-weight: 600;
}

.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.me {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-ink);
  background: var(--brand);
  cursor: pointer;
}

.quit {
  font-size: 14px;
  color: var(--text2);
  cursor: pointer;
  transition: color 0.2s;
}
.quit:hover {
  color: var(--brand-deep);
}

/* 游客身份标识：点去注册（需求口径——玩可以免注册，收藏/长期保留要注册） */
.guest-tag {
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-deep);
  background: rgba(14, 165, 233, 0.12);
  border: 1px dashed rgba(14, 165, 233, 0.5);
  border-radius: 999px;
  padding: 3px 10px;
  text-decoration: none;
  white-space: nowrap;
}
.guest-tag:hover {
  background: rgba(14, 165, 233, 0.2);
}

/* 游客醒目提醒条 */
.guestbar {
  background: linear-gradient(90deg, rgba(14, 165, 233, 0.16), rgba(14, 165, 233, 0.06));
  border-bottom: 1px solid rgba(14, 165, 233, 0.28);
}
/* ⚠️ 2026-10-18 第四十七批：桌面档保持原来的一行三段（flex），
   手机档才切成卡片两行 —— 桌面结构与改前完全一致，A/B 才能保 0。 */
.guestbar .container {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 10px;
  padding-bottom: 10px;
}
/* ⚠️ 2026-10-18 第四十七批：手机档卡片两行（用户："游客模式的提醒 做的太丑了 排布也不好看"）。
   桌面档不渲染 .guestcard（见模板 v-if="isPhone"），所以这些规则只影响手机。
   原来手机上是 flex-wrap 的横排三段，被挤成"左标签 / 中间四行小字 / 右按钮"，参差不齐。 */
.guestcard {
  display: flex;
  flex-direction: column;
  gap: 7px;
  width: 100%;
}
.gtop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
/* 手机档才收字号（桌面档保持原来的 13/13.5px，否则 A/B 会报每页 4 项几何差异） */
@media (max-width: 640px) {
  .guestbar .gt {
    font-size: 12.5px;
    padding: 4px 11px;
  }
  .guestbar .gm {
    flex: 0 0 auto;
    min-width: 0;
    margin: 0;
    font-size: 12.5px;
    line-height: 1.6;
  }
}
.guestbar .gt {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: var(--brand-ink, #04263c);
  background: var(--brand);
  border-radius: 999px;
  padding: 3px 11px;
}
.guestbar .gm {
  flex: 1;
  min-width: 220px;
  font-size: 13.5px;
  color: var(--text2);
}
.guestbar .gm b {
  color: var(--brand-deep);
}

.main {
  flex: 1;
  padding: 26px 0 40px;
}

.foot {
  border-top: 1px solid var(--line);
  padding: var(--sp-5) 0;
  font-size: var(--fs-xs);
  color: var(--text3);
}

.banned-line {
  margin-bottom: var(--sp-2);
  line-height: 1.7;
}

/* ═══════════════════════════════════════════════════════════════════════
   手机端底部 Tab（P0-4 分端导航）
   ---------------------------------------------------------------------
   ⚠️ 默认（=桌面端）整条 `display:none`：既不占位也不参与布局。
      这是「做手机适配不能影响桌面端」的第一道保证，
      由 probe-r40-desktop-ab.mjs 在 1440×900 下逐元素比对证明。
   ═══════════════════════════════════════════════════════════════════════ */
.tabbar {
  display: none;
}

@media (max-width: 640px) {
  /* ① 顶部导航的中间链接收起 —— 它们已经全部落到底部 Tab（同样的路由、同样的顺序）；
       顶栏只留「返回 / logo / 头像」，一行放得下、也不再有一堆 23px 高的小热区。 */
  .nav-inline a:not(.logo) {
    display: none;
  }
  .bar {
    gap: 12px;
  }
  /* 「游客 · 注册」与「退出」在手机上收进「我的」页（ProfileView 的账号区），
     顶栏留给返回 + logo + 头像，避免 375 宽下挤成一团。 */
  .guest-tag {
    display: none;
  }
  .quit {
    display: none;
  }
  /* 头像热区 32 → 44（项目「任何文字 ≥12px」不动字号，只撑热区） */
  .me {
    width: 44px;
    height: 44px;
    font-size: 15px;
  }
  .logo {
    font-size: 16px;
  }

  /* ② 底部 Tab 本体 */
  .tabbar {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    align-items: stretch;
    /* ⚠️ iPhone 底部手势条上方留白（变量见 base.css；index.html 必须开 viewport-fit=cover，否则恒为 0） */
    padding-bottom: var(--safe-b);
    background: var(--glass);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid var(--gbd);
    box-shadow: 0 -6px 22px rgba(15, 42, 66, 0.14);
  }
  .tabitem {
    flex: 1 1 0;
    min-width: 0;
    /* ⚠️ 56px 而不是行业下限 44px：底部条是"整条拇指落点"，高一点更稳；
       且 44px 是**下限**，这里取 56 只是更宽松，不是破坏规则。 */
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: var(--text3);
    text-decoration: none;
    /* ⚠️ 12px 是项目字号下限，不能再小 */
    font-size: 12px;
    font-weight: 600;
    transition: color 0.18s;
    -webkit-tap-highlight-color: transparent;
  }
  .tabitem svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tabitem.on {
    color: var(--brand-deep);
  }

  /* ③ 内容区给底部条让位（fixed 会盖住内容）：条高 56 + 呼吸 20 + 手势条 */
  .main {
    padding: 18px 0 calc(var(--tabbar-h) + 20px + var(--safe-b));
  }
  .foot {
    /* ⚠️ 2026-10-18 第四十七批：去掉 --tabbar-h（`.main` 已经统一让过一遍）。
       原来 .main 让 76px + .foot 又让 88px，页脚底下白出一大截（用户截图指出）。
       现在只留 12px 呼吸 + 安全区。 */
    padding-bottom: calc(var(--sp-3) + var(--safe-b));
  }
}
/* ⭐ Edge 兜底（守则：每加一个新视觉效果都要同步加 html.ua-edge 覆盖）：
   底部条的毛玻璃在 Edge 上可能触发闪屏，稳定/极简档直接换成实心底。 */
html.ua-edge[data-compat='lite'] .tabbar,
html.ua-edge[data-compat='safe'] .tabbar {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background: var(--card);
}
</style>
