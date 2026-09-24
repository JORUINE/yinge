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

    <!-- 游客醒目提醒：不注册也能玩全部主线；但游客数据只留本机，注册后可云同步 -->
    <div v-if="!isAdmin && auth.isLoggedIn && auth.isGuest" class="guestbar">
      <div class="container">
        <span class="gt">游客模式</span>
        <span class="gm">
          不注册也能玩全部主线玩法。但<b>游客数据只保存在这台设备的浏览器里</b>（换设备 / 清缓存会丢），也不计入排行榜；
          注册后可云同步、收藏专辑、上榜。
        </span>
        <RouterLink to="/login" class="btn pri sm">注册 / 登录</RouterLink>
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

const bannedVisible = ref(false);
const bannedReason = ref(null);
const bannedNote = ref(null);

const avatarChar = computed(() => (auth.nickname || '音').slice(0, 1));

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
.guestbar .container {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 10px;
  padding-bottom: 10px;
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

@media (max-width: 760px) {
  .nav-inline a:not(.logo) {
    display: none;
  }
}
</style>
