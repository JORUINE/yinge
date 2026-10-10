/**
 * 人格卡·卡面标定表（2026-10-05，从「人格卡demo v8」原样搬进来）
 * ------------------------------------------------------------
 * 这里的每个数字都是**量出来的**，不是看着调的。取证脚本在
 * `C:\Users\胡祖锐\WorkBuddy\2026-09-14-13-52-08\tools\pw\`：
 *   probe-typography.mjs  字重（墨密度法）· probe-accent2.mjs 条色（条心取样）
 *   probe-bar10.mjs 条厚 · verify-carddemo.mjs 全量硬断言
 *
 * 字段说明：
 *   ink/ink2 主字色/副题色 · accent 条填充 · track 条底槽 · lb/vl 指标标签与数值色
 *   div 标题下的分隔（line 细线 / dot 发光点 / none）
 *   fam 结构族：A 中段指标 · B 下段指标 · C 左栏三段式
 *   long/sq  两个画幅各自的定位令牌（headTop 标题位置 / anchor 指标靠上还是靠下 /
 *            pad 左右留白 / mx 指标块留白 / fsTitle 标题字号 / gap 指标间距 / bgpos 取景）
 *   dims 见 PersonalityCard.vue 的说明（卡上只上 3 根条）
 *
 * ⚠️ 改这里的值 = 改用户已经确认过的卡面，先问。
 */
export const CARD_TYPES = {
  CLM: {
    name: '安静聆听者',
    desc: '要的是氛围，是情绪的沉浸',
    fam: 'A',
    ink: '#eaf4ff',
    ink2: '#cfe4ff',
    accent: '#9ad8fd',
    track: 'rgba(255,255,255,.26)',
    div: 'line',
    tsh: '0 2px 16px rgba(6,34,80,.5)',
    toneSq:
      'linear-gradient(180deg,rgba(3,24,62,.14),rgba(3,24,62,.30) 30%,rgba(3,24,62,.30) 66%,rgba(3,24,62,.14))',
    long: { headTop: '16%', anchor: 'top', metTop: '36.5%', pad: 78, mx: 106, fsTitle: 59, gap: 28, bgpos: '50% 50%' },
    sq: { headTop: '13.5%', anchor: 'top', metTop: '37%', pad: 52, mx: 52, tch: 50, gap: 22, bgpos: '50% 88%', keep: 1 },
  },
  MEL: {
    name: '旋律捕手',
    desc: '先记住旋律，再把心动哼成歌',
    fam: 'B',
    ink: '#e8e6ff',
    ink2: '#cfcbff',
    accent: '#7b7cf7',
    track: 'rgba(255,255,255,.16)',
    div: 'dot',
    tsh: '0 0 26px rgba(150,130,255,.6),0 2px 14px rgba(0,0,0,.45)',
    glowbar: 1,
    long: { headTop: '8.5%', anchor: 'bottom', metBottom: '9%', pad: 78, mx: 78, fsTitle: 65, gap: 28, bgpos: '50% 50%' },
    sq: { headTop: '8%', anchor: 'bottom', metBottom: '3%', pad: 58, mx: 56, tch: 53, gap: 21, bgpos: '50% 40%', keep: 1 },
  },
  EXP: {
    name: '探索者',
    desc: '越没听过越有兴趣，耳朵永远在冒险',
    fam: 'A',
    ink: '#ffe9c2',
    ink2: '#f5d9a6',
    accent: '#f2c667',
    track: 'rgba(255,255,255,.22)',
    div: 'dot',
    tsh: '0 0 26px rgba(255,200,90,.55),0 2px 12px rgba(90,50,0,.5)',
    glowbar: 1,
    long: { headTop: '9.5%', anchor: 'top', metTop: '34.5%', pad: 78, mx: 106, fsTitle: 74, gap: 28, bgpos: '50% 50%' },
    sq: { headTop: '6.5%', anchor: 'top', metTop: '34.5%', pad: 58, mx: 56, tch: 60, gap: 24, bgpos: '50% 86%', keep: 1 },
  },
  LYR: {
    name: '词句收藏家',
    desc: '歌词是一首歌的灵魂，每句都值得被记住',
    fam: 'C',
    ink: '#7a4e07',
    /* ⚠️ 2026-10-07 第三十批：ink2 / lb / vl 是**实测反解**出来的，不是拍脑袋加深 ——
       在最差真实渲染底色（浅金 #f0ce8e）上，原值只有 3.76 / 3.84 / 1.89（全线不达标），
       保持色相只压明度到刚好 ≥4.6（见 tools/pw/solve-r30-ink.mjs，网格取样取最差底色）。
       vl 原来是 #c2912c（亮金），在浅金底上几乎看不见 —— 现在是 #72551a（仍是金调但压得下）。 */
    ink2: '#6e4910',
    accent: '#d4a53f',
    track: 'rgba(255,255,255,.62)',
    lb: '#7a5112',
    vl: '#72551a',
    div: 'none',
    tsh: '0 1px 0 rgba(255,250,235,.55),0 2px 12px rgba(120,80,20,.22)',
    stack: 1,
    long: {
      headTop: '16.5%', anchor: 'top', metTop: '37%', pad: 80, mx: 92, mw: 215, halign: 'left',
      fsTitle: 65, fsNum: 41, fsBar: 12, gap: 30, bgpos: '50% 50%',
    },
    sq: {
      headTop: '12%', anchor: 'top', metTop: '27%', pad: 46, mx: 46, mw: 186, halign: 'left',
      tch: 50, gap: 14, stk: 36, bgpos: '50% 88%', keep: 1,
    },
  },
  TMB: {
    name: '音色控',
    desc: '相比于节奏和旋律，我更在乎声音的质感',
    fam: 'B',
    ink: '#12615f',
    /* ⚠️ 2026-10-07 第三十批：副题色从 #2d7773 压到 #225a57 ——
       实测在卡面最差底色（浅青 #88def8）上原值只有 3.46，标题下那行"相比节奏和旋律…"发虚读不清。
       保持青绿色相只压明度到 ≥4.6。ink（标题/维度条色）本来就 5.96 达标，不动。 */
    ink2: '#225a57',
    accent: '#2e908b',
    track: 'rgba(18,97,95,.16)',
    div: 'none',
    tsh: '0 1px 0 rgba(255,255,255,.5),0 2px 12px rgba(20,90,85,.22)',
    panel: 1,
    /* ⚠️ 2026-10-07 第三十三批：.46 → .34。用户反馈"竖版卡的插画被维度条压住"
     （对比图鉴卡的横条带，那里插画是完整的）。这型是唯一给指标区铺半透明白板的，
     板一厚就把下面的插画糊住了 ⇒ 调透一档，让插画透上来；文字对比度由 verify-r30 兜底。
     ⚠️ 没有去动插画取景（bgpos）—— 那是成品卡的构图，改了就是另一张卡。 */
    'panel-bg': 'rgba(255,255,255,.34)',
    /** ⚠️ 这张成品卡实测是 2:3（其余 5 张 3:4）—— 待用户拍板项 A，见改动记录 */
    long: { headTop: '8.5%', anchor: 'bottom', metBottom: '3%', pad: 78, mx: 52, fsTitle: 74, gap: 20, barW: '58%', panelPad: '20px 24px', bgpos: '50% 50%' },
    sq: {
      headTop: '6.5%', anchor: 'bottom', metBottom: '1%', pad: 56, mx: 39, fsTitle: 59.8, gap: 6,
      fsDesc: 11.5, fsLb: 12.5, fsVl: 16, fsVi: 10, fsBar: 6.5, barW: '58%', mtBar: 3, mtRow: 3, mtDesc: 12, lh: 1.15,
      panelPad: '10px 14px', bgpos: '50% 45%',
    },
  },
  RHY: {
    name: '节拍动物',
    desc: '身体先动，节奏是本能的开关',
    fam: 'B',
    ink: '#ffffff',
    ink2: '#ffeccc',
    accent: '#fbc63f',
    track: 'rgba(255,255,255,.3)',
    lb: '#ffffff',
    vl: '#ffffff',
    div: 'line',
    /* ⚠️ 2026-10-07 第三十三批：从"柔和投影"改成**暗描边**（0 1px 2px 压边 + 0 0 6px 柔光）。
       原因：维度底板已改为浅色，白字在变亮的橙底上只有 1.53 的对比度（看不见）。
       把描边做在文字上，既能读清、又不引入任何"框"。 */
    tsh: '0 1px 2px rgba(92,26,0,.9), 0 0 7px rgba(92,26,0,.55)',
    serif: false,
    icons: 1,
    glowbar: 1,
    tone: 'linear-gradient(180deg,rgba(120,35,0,.20),transparent 30%,transparent 74%,rgba(120,35,0,.16))',
    toneSq: 'linear-gradient(180deg,rgba(120,35,0,.22),transparent 26%,transparent 52%,rgba(105,26,0,.34))',
    /** 六个型里唯一用重磅黑体的标题（成品卡上就是这样），单独把字重顶回去 */
    long: { headTop: '11%', anchor: 'bottom', metBottom: '8%', pad: 78, mx: 74, fsTitle: 65, gap: 13, fwTitle: 900, bgpos: '50% 50%' },
    sq: { headTop: '4.5%', anchor: 'bottom', metBottom: '1%', pad: 56, mx: 50, tch: 53, gap: 14, fwTitle: 900, bgpos: '50% 70%', keep: 1 },
  },
};

/**
 * 长版统一字号（依据用户的 long-CLM 成品卡实测标定，单位 css px）
 *   副题 18.5 · 标签 18 · 数值 21 · 条 12 · 行高 1.15
 * fsBar 12 的来历：同一画面尺度（长 520）下用户 6 张成品卡的条厚 = 12~15px，我原来只有 10px。
 * 方版 = 长版 × 0.808（令牌 --u），12 × 0.808 = 9.7px，与用户方版卡实测 10px 一致。
 */
export const LONG_TYPO = {
  fsDesc: 18.5, fsLb: 18, fsVl: 21, fsVi: 15, fsBar: 12, mtBar: 10,
  /* ⚠️ 2026-10-07 第三十批：12 → 17。渲染出来是 12×--scale(≈0.85) ≈ 10px，
     用户看着"标题和副标题挤在一起"。⚠️ 这个值之前一直是 12，所以 CSS 里
     `var(--mt-desc, 17)` 的新默认值被它盖掉了（自定义属性一旦有值，fallback 就不生效）——
     改这类"藏在 config 兜底里的值"时记得：CSS 的 fallback 只是兜底，不是覆盖。 */
  mtDesc: 17,
  lh: 1.15, lsDesc: '0.04em', lsLb: '0.04em',
};

/** 指标行前的圆形图标（节拍动物那张卡用），按卡上顺序 wave / drum / calm */
export const CARD_ICONS = {
  wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 9.2c2.6-2.6 5.2-2.6 7.8 0s5.2 2.6 7.8 0"/><path d="M3 15c2.6-2.6 5.2-2.6 7.8 0s5.2 2.6 7.8 0"/></svg>',
  drum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><ellipse cx="12" cy="9" rx="7.2" ry="3.1"/><path d="M4.8 9v5.3c0 1.7 3.2 3.1 7.2 3.1s7.2-1.4 7.2-3.1V9"/><path d="M9.2 6.2 10.6 2.8M14.8 6.2 13.4 2.8"/></svg>',
  calm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="5.6" r="2.9"/><path d="M4.6 20.4c0-4.1 3.3-7.4 7.4-7.4s7.4 3.3 7.4 7.4"/></svg>',
};
