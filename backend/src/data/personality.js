/**
 * 音乐人格 · 题目与类型（唯一数据源）
 * ------------------------------------------------------------
 * ⚠️ 内部分类法以设计稿 docs/design/音格-UI设计稿.html 为准：
 *   6 个类型 = 旋律捕手 / 节拍动物 / 词句收藏家 / 音色控 / 安静聆听者 / 探索者
 *
 * ══════════════════════════════════════════════════════════════════════
 * 2026-09-22 大改：为什么把维度从 4 个扩到 6 个
 * ══════════════════════════════════════════════════════════════════════
 * 老版本用 4 个维度（melody / rhythm / arrangement / calm）去区分 6 个类型，
 * 结果有**两个类型几乎永远匹配不到**：
 *   · 词句收藏家 LYR —— 它的核心是"歌词"，而 4 个维度里**根本没有文本这一维**；
 *     它只能在 arrangement 上争，但 arrangement 输给音色控(1.0)与探索者(0.9)，永远排不到第一。
 *   · 探索者 EXP —— "想听没听过的"这件事，4 个维度里也没有对应维度。
 * 也就是说：题目问的是歌词和新鲜感，计分表里却没有这两项 —— 用户说的
 * "六种人格对应题目逻辑情感一定要一致"，问题就出在这里（题目与维度不对齐）。
 *
 * 现在的做法（两条线分开）：
 *   · **计分维度 6 个**（SCORE_DIMS）：melody / rhythm / lyric / texture / novelty / calm，
 *     每个类型都拥有**一个别人比不过的独占维度**（见 TYPES 里每个型 1.0 的那一维），
 *     所以 6 个类型彼此可分；
 *   · **展示维度仍是 4 个**（DISPLAY_DIMS，人格卡上那 4 根条）：melody / rhythm / arrangement / calm。
 *     后端把 6 维折算成这 4 条再返回，**前端与人格卡样式零改动**（守则 103：不动已认可的界面）。
 *
 * 理论依据（答辩可引用）：
 *   ① Rentfrow & Gosling (2003) "The Do Re Mi's of Everyday Life" —— 音乐偏好可归为
 *      4 个维度：Reflective & Complex / Intense & Rebellious / Upbeat & Conventional /
 *      Energetic & Rhythmic；并与大五人格显著相关（开放性↔反思复杂/强烈叛逆，
 *      外向性↔能量节奏/乐观传统，随和与尽责↔乐观传统）。后续 Rentfrow, Goldberg &
 *      Levitin (2011) 又修订为 MUSIC 五因子（Mellow / Unpretentious / Sophisticated /
 *      Intense / Contemporary）。
 *   ② Greenberg et al. (2016) "The Song Is You" —— 提出应**脱离流派、改用音乐属性**
 *      描述偏好，抽出三个主成分：Arousal（强度/能量）、Valence（情绪正负）、
 *      Depth（深度/复杂/审美）。本项目的 rhythm≈Arousal、calm≈低 Arousal、
 *      texture/lyric≈Depth、melody≈Valence。
 *   ③ Juslin & Västfjäll (2008) BRECVEMA —— 音乐诱发情绪有 8 条机制，其中
 *      brain stem reflex 与 rhythmic entrainment 是**最快**的两条（亚秒级起效）。
 *      这就是"听感题"成立的依据：只放 30 秒片段，捕捉的是第一反应，
 *      而第一反应恰恰最干净地暴露了这个人对哪一类音乐特征敏感。
 *   ④ 六个类型的定位（与上面文献的对应）：
 *      MEL 旋律捕手 ← Upbeat & Conventional 的旋律导向、高 Valence
 *      RHY 节拍动物 ← Energetic & Rhythmic、高 Arousal、依赖 rhythmic entrainment
 *      LYR 词句收藏家 ← Reflective & Complex（重文本/叙事）、高 Depth
 *      TMB 音色控   ← MUSIC 的 Sophisticated、高 Depth（制作/音色）、aesthetic judgement
 *      CLM 安静聆听者 ← MUSIC 的 Mellow、低 Arousal
 *      EXP 探索者   ← Openness to Experience（两篇 Rentfrow 研究都指向开放性）、寻求新奇
 *
 * 历史坑（2026-09-17）：更早还用过一套（电音狂热者…EN/NT/EX/SO/CL/BL，
 * 维度 energy/social/curiosity/nostalgia），与设计稿完全不通，已废弃。
 */

/** 已废弃的旧人格 code（2026-09-17 之前那套）——seed/迁移时必须清掉，否则库里会同时存在两套 */
export const DEPRECATED_TYPE_CODES = ['EN', 'NT', 'EX', 'SO', 'CL', 'BL'];

/** ===== 计分维度（6 个）===== */
export const DIMS = ['melody', 'rhythm', 'lyric', 'texture', 'novelty', 'calm'];

/**
 * 听感题的"中立出口"选项文案（2026-09-22）
 * 用户："万一很像跟着唱这种该怎么选？还有就是完全无感甚至讨厌呢？"
 * —— 听感是当下反应，本来就可能没感觉；给一个不加分的出口，用户不必在四种"喜欢"里硬挑。
 * ⚠️ 它**不给任何维度加分**（score 空对象），所以不会污染计分；
 *    归一化的分母是按"本次抽到的题"算的，弃权会让该题对所有维度都不贡献，口径一致。
 */
export const NEUTRAL_LABEL = '说不上来，没什么感觉';

/** 只加在听感题上的中立出口 key（前端/自检要认得它） */
export const NEUTRAL_KEY = 'E';

export const DIM_LABELS = {
  melody: '旋律敏感',
  rhythm: '节奏偏好',
  lyric: '文本共鸣',
  texture: '音色质感',
  novelty: '探索欲',
  calm: '安静倾向',
};

/** ===== 展示维度（人格卡上那 4 根条，保持原设计不变）===== */
export const DISPLAY_DIMS = ['melody', 'rhythm', 'arrangement', 'calm'];

export const DISPLAY_DIM_LABELS = {
  melody: '旋律敏感',
  rhythm: '节奏偏好',
  arrangement: '编曲层次',
  calm: '安静倾向',
};

/**
 * 抽题规则（定稿）
 * ------------------------------------------------------------
 * 用户要求：题量 18–24、听感题 4–6、题库扩到 50、题目随机（每次不一样）。
 * 取在区间中位：**每次 20 道 = 听感 4 道 + 选择 16 道**。
 * 选择 16 道**按维度配平**（melody 3 / rhythm 3 / lyric 3 / texture 3 / novelty 2 / calm 2），
 * 这样"随机"只影响抽到哪几道，不会让某个维度整体偏多或偏少 —— 分数才可比。
 */
export const SAMPLE_RULE = {
  total: 20,
  audio: 4,
  choice: 16,
  /** 选择部分每维度抽几道（合计正好 16） */
  choiceByDim: { melody: 3, rhythm: 3, lyric: 3, texture: 3, novelty: 2, calm: 2 },
};

/** 允许的题量区间（改规则时不必改代码，接口按这个校验） */
export const SAMPLE_LIMITS = { min: 18, max: 24, audioMin: 4, audioMax: 6 };

/**
 * 听感题音频标签 → 曲库流派正则
 * ------------------------------------------------------------
 * 听感题**不写死某一首歌**：写死会随曲库/版权变动失效。这里只声明"要什么气质的片段"，
 * 服务端在返回题目时从我们自己的曲库里按流派随机挑一首**带 30 秒试听**的曲目。
 * 好处：① 永远拿得到音频；② 每次听到的片段可能不同，符合"随机题库"的精神；
 *       ③ 题干问的都是**即时感受**（听到鼓点想不想动／想不想跟着哼），
 *          不依赖具体是哪一首，所以换来换去不影响效度。
 *
 * ⚠️ 2026-09-22 踩坑：一开始只写了英文流派名（Pop / Mandopop / R&B…），结果**一条也匹配不到** ——
 *    中文区 iTunes 返回的流派是**繁体中文**：國語流行樂 / 廣東歌 / 香港流行樂 / 流行樂 /
 *    舞曲 / 搖滾 / 硬搖滾 / R&B/騷靈樂 / 原聲配樂 / 另類音樂 / 節慶 …
 *    所以正则必须中英双写。（实测库里的分布：廣東歌·香港流行樂 1650、國語流行樂 1588、
 *    流行樂 911、Hip-Hop/Rap 591、舞曲 270、原聲配樂 222、搖滾 220、R&B/騷靈樂 198…）
 */
export const AUDIO_TAG_GENRE = {
  /** 节奏驱动 */
  rhythm: '舞曲|摇滚|搖滾|節慶|Hip-Hop|Rap|R&B|騷靈|放克|流行樂|Dance|Electronic|Soul|Funk',
  /** 旋律驱动 */
  melody: '國語流行樂|流行樂|廣東歌|香港流行樂|民謠|原聲配樂|Pop|Folk|Ballad|Singer',
  /** 安静氛围 */
  quiet: '原聲配樂|爵士|古典|民謠|新世纪|新世紀|Jazz|Classical|Ambient|Soundtrack|Easy',
  /** 音色/制作驱动 */
  texture: '另類音樂|搖滾|硬搖滾|舞曲|原聲配樂|Alternative|Indie|Experimental|Ambient',
  /** 人声驱动 */
  vocal: '國語流行樂|廣東歌|香港流行樂|流行樂|R&B|騷靈|爵士|Pop|Soul|Jazz',
};

/**
 * 听感题音频 · 人工白名单（2026-09-22，D4）
 * ------------------------------------------------------------
 * 用户指令："人工去市面上音乐 app 按对应类型热门歌曲挑选部分，再结合音乐口碑挑选。"
 * 挑选原则：该曲明显体现这种气质 + 市面热门 + 口碑公认。跨标签重复是故意的（一首好歌常兼具多气质）。
 * 只在"曲库里真有、且缓存了试听曲目"的专辑上生效；库里没有的（命名差异/未入库）自然落空，退回 genre 定向兜底。
 */
export const AUDIO_WHITELIST = {
  rhythm: [
    { artist: 'Michael Jackson', album: 'Thriller' },
    { artist: 'Daft Punk', album: 'Random Access Memories' },
    { artist: 'Daft Punk', album: 'Discovery' },
    { artist: 'Bruno Mars', album: '24K Magic' },
    { artist: 'Dua Lipa', album: 'Future Nostalgia' },
    { artist: 'Kendrick Lamar', album: 'good kid, m.A.A.d city' },
    { artist: 'The Weeknd', album: 'Starboy' },
    { artist: '周杰伦', album: '范特西' },
  ],
  melody: [
    { artist: 'The Beatles', album: 'Abbey Road' },
    { artist: 'Adele', album: '21' },
    { artist: 'Taylor Swift', album: '1989' },
    { artist: 'Ed Sheeran', album: '÷' },
    { artist: '周杰伦', album: '七里香' },
    { artist: '孫燕姿', album: '遇見' },
    { artist: '劉若英', album: '後來' },
    { artist: 'Fleetwood Mac', album: 'Rumours' },
  ],
  quiet: [
    { artist: 'Radiohead', album: 'In Rainbows' },
    { artist: 'Ludovico Einaudi', album: 'Divenire' },
    { artist: 'Max Richter', album: 'Sleep' },
    { artist: 'Joni Mitchell', album: 'Blue' },
    { artist: '陳綺貞', album: '華麗的冒險' },
    { artist: '李健', album: '似水流年' },
    { artist: '王菲', album: '寓言' },
    { artist: '羅大佑', album: '之乎者也' },
  ],
  texture: [
    { artist: 'Tame Impala', album: 'Currents' },
    { artist: 'Arctic Monkeys', album: 'AM' },
    { artist: 'Björk', album: 'Homogenic' },
    { artist: 'Daft Punk', album: 'Discovery' },
    { artist: 'Taylor Swift', album: '1989' },
    { artist: '陳奕迅', album: 'U87' },
    { artist: '王力宏', album: '蓋世英雄' },
    { artist: 'Radiohead', album: 'OK Computer' },
  ],
  vocal: [
    { artist: 'Adele', album: '21' },
    { artist: 'Lady Gaga', album: 'The Fame' },
    { artist: 'Fleetwood Mac', album: 'Rumours' },
    { artist: '孫燕姿', album: '遇見' },
    { artist: '梁靜茹', album: '勇氣' },
    { artist: '劉若英', album: '後來' },
    { artist: '王菲', album: '寓言' },
    { artist: 'Taylor Swift', album: '1989' },
  ],
};

/**
 * 题库 50 道（选择 42 + 听感 8）
 * ------------------------------------------------------------
 * 每题结构：
 *   order      题库序号（唯一，迁移脚本按它 upsert）
 *   type       choice | audio
 *   primary    主维度 —— 抽题时按它配平（每维度题数均衡），也便于后台统计
 *   title      题干
 *   audioRef   仅听感题：音频气质标签（见 AUDIO_TAG_GENRE）
 *   options    4 个选项，score 用 6 个计分维度
 * ⚠️ 写题纪律：同一题的 4 个选项必须是**同一个情境下的 4 种自然反应**，
 *    而且要尽量"等价诱人"（不能有一个选项明显更体面），否则会测出社会赞许性而不是偏好。
 */
export const QUESTIONS = [
  // ══════════════════ melody 旋律敏感（8 道） ══════════════════
  {
    order: 1,
    type: 'choice',
    primary: 'melody',
    title: '一首歌让你"上头"，通常是哪一下？',
    dims: ['melody', 'texture', 'rhythm', 'lyric'],
    options: [
      { key: 'A', label: '那句副歌一出来，整个人就对了', score: { melody: 3 } },
      { key: 'B', label: '一开嗓那个声音质感先抓住我', score: { texture: 3 } },
      { key: 'C', label: '鼓点一进来，身体先醒', score: { rhythm: 3 } },
      { key: 'D', label: '某句词突然戳到我', score: { lyric: 3 } },
    { key: 'E', label: '没有特别记住哪一下，听完就过去了', score: { melody: -3 } },
    ],
  },
  {
    order: 2,
    type: 'choice',
    primary: 'melody',
    title: '你更容易记住一首歌的什么？',
    dims: ['melody', 'texture', 'lyric', 'calm'],
    options: [
      { key: 'A', label: '旋律怎么走的，我最先注意到', score: { melody: 3 } },
      { key: 'B', label: '谁唱的、声音什么质地', score: { texture: 2, melody: 1 } },
      { key: 'C', label: '它到底在讲什么', score: { lyric: 3 } },
      { key: 'D', label: '整首歌笼着什么气氛', score: { calm: 3 } },
    ],
  },
  {
    order: 3,
    type: 'choice',
    primary: 'melody',
    title: '听到一首没听过的歌，你多快能跟着哼？',
    dims: ['melody', 'calm'],
    options: [
      { key: 'A', label: '听一遍差不多就能跟着哼', score: { melody: 3 } },
      { key: 'B', label: '得二三遍才跟得上', score: { melody: 1, calm: 1 } },
      { key: 'C', label: '只记得住最抓耳的那一句', score: { melody: 2 } },
      { key: 'D', label: '我通常不跟着哼，就静静听', score: { calm: 2 } },
    { key: 'E', label: '旋律对我没那么重要，记不记得都行', score: { melody: -3 } },
    ],
  },
  {
    order: 4,
    type: 'choice',
    primary: 'melody',
    title: '听翻唱的时候，你会比较哪一点？',
    dims: ['melody', 'texture', 'lyric', 'novelty'],
    options: [
      { key: 'A', label: '谁把旋律唱得更顺耳', score: { melody: 3 } },
      { key: 'B', label: '谁的版本更让人耳目一新', score: { novelty: 2, texture: 1 } },
      { key: 'C', label: '谁把词唱得更走心', score: { lyric: 3 } },
      { key: 'D', label: '谁的声音更经得起反复听', score: { texture: 3 } },
    ],
  },
  {
    order: 5,
    type: 'choice',
    primary: 'melody',
    title: '你靠什么判断一段旋律"好不好听"？',
    dims: ['melody', 'texture', 'calm', 'novelty'],
    options: [
      { key: 'A', label: '会不会想再听一遍', score: { melody: 3 } },
      { key: 'B', label: '有没有让我起鸡皮疙瘩', score: { melody: 2, calm: 1 } },
      { key: 'C', label: '写法巧不巧、新不新', score: { texture: 2, novelty: 1 } },
      { key: 'D', label: '情绪落没落到我心里', score: { calm: 2, lyric: 1 } },
    ],
  },
  {
    order: 6,
    type: 'choice',
    primary: 'melody',
    title: '走在路上突然想起一首歌，你想起的一般是？',
    dims: ['melody', 'rhythm', 'lyric', 'texture'],
    options: [
      { key: 'A', label: '副歌那一段，挥之不去', score: { melody: 3 } },
      { key: 'B', label: '某个节奏型，一直循环', score: { rhythm: 3 } },
      { key: 'C', label: '某一句词，突然蹦出来', score: { lyric: 3 } },
      { key: 'D', label: '某个音色，或者那股混响', score: { texture: 3 } },
    { key: 'E', label: '想不起来，旋律没在我这留痕', score: { melody: -3 } },
    ],
  },
  {
    order: 7,
    type: 'choice',
    primary: 'melody',
    title: '给朋友安利一首歌，你通常怎么开口？',
    dims: ['melody', 'lyric', 'texture', 'calm'],
    options: [
      { key: 'A', label: '「你先听副歌，这段绝了」', score: { melody: 3 } },
      { key: 'B', label: '「你听这句词，写得太准」', score: { lyric: 3 } },
      { key: 'C', label: '「你听这个鼓、这个合成器」', score: { texture: 2, rhythm: 1 } },
      { key: 'D', label: '「你听这个氛围，很对味」', score: { calm: 3 } },
    ],
  },
  {
    order: 8,
    type: 'choice',
    primary: 'melody',
    title: '一首歌你最不能忍的是？',
    dims: ['melody', 'texture', 'lyric', 'calm'],
    options: [
      { key: 'A', label: '旋律太平，听完什么都没留下', score: { melody: 3 } },
      { key: 'B', label: '编曲糊成一团，分不清层次', score: { texture: 3 } },
      { key: 'C', label: '词写得很敷衍，像凑的', score: { lyric: 3 } },
      { key: 'D', label: '一直很吵，让人喘不过气', score: { calm: 3 } },
    { key: 'E', label: '旋律本身好坏，我其实不太挑', score: { melody: -3 } },
    ],
  },

  // ══════════════════ rhythm 节奏偏好（7 道） ══════════════════
  {
    order: 9,
    type: 'choice',
    primary: 'rhythm',
    title: '听歌的时候，你的身体最常有什么反应？',
    dims: ['rhythm', 'calm', 'melody'],
    options: [
      { key: 'A', label: '脚会不自觉跟着点', score: { rhythm: 3 } },
      { key: 'B', label: '头会跟着晃', score: { rhythm: 3 } },
      { key: 'C', label: '就静静听，不太会动', score: { calm: 3 } },
      { key: 'D', label: '会跟着哼起旋律', score: { melody: 3 } },
    { key: 'E', label: '身体没什么反应，坐着听就挺好', score: { rhythm: -3 } },
    ],
  },
  {
    order: 10,
    type: 'choice',
    primary: 'rhythm',
    title: '挑歌单的时候，你第一条标准是？',
    dims: ['rhythm', 'melody', 'calm', 'novelty'],
    options: [
      { key: 'A', label: '够不够带劲、能让人动', score: { rhythm: 3 } },
      { key: 'B', label: '够不够好听、顺耳', score: { melody: 3 } },
      { key: 'C', label: '够不够耐听、能反复放', score: { calm: 2, texture: 1 } },
      { key: 'D', label: '够不够新鲜、没听过', score: { novelty: 3 } },
    ],
  },
  {
    order: 11,
    type: 'choice',
    primary: 'rhythm',
    title: '什么时候你最需要节奏强一点的歌？',
    dims: ['rhythm', 'calm'],
    options: [
      { key: 'A', label: '运动、走路的时候', score: { rhythm: 3 } },
      { key: 'B', label: '写东西、干活需要提神的时候', score: { rhythm: 2, calm: 1 } },
      { key: 'C', label: '心里憋着、想发泄的时候', score: { rhythm: 3 } },
      { key: 'D', label: '我很少专门找强节奏的歌', score: { calm: 3 } },
    { key: 'E', label: '强节奏反而让我更烦躁', score: { rhythm: -3 } },
    ],
  },
  {
    order: 12,
    type: 'choice',
    primary: 'rhythm',
    title: '一首歌的鼓组换掉了，你能听出来吗？',
    dims: ['rhythm', 'texture', 'calm'],
    options: [
      { key: 'A', label: '一下就能听出来', score: { rhythm: 3, texture: 1 } },
      { key: 'B', label: '反复听会有点感觉', score: { rhythm: 2 } },
      { key: 'C', label: '基本听不出来', score: { calm: 2, lyric: 1 } },
      { key: 'D', label: '我更关注别的地方', score: { texture: 2 } },
    ],
  },
  {
    order: 13,
    type: 'choice',
    primary: 'rhythm',
    title: '看现场演出，你最看重什么？',
    dims: ['rhythm', 'melody', 'texture', 'calm'],
    options: [
      { key: 'A', label: '现场的热度与律动，能嗨起来', score: { rhythm: 3 } },
      { key: 'B', label: '唱功与音准，稳不稳', score: { melody: 3 } },
      { key: 'C', label: '编曲与音响层次够不够满', score: { texture: 3 } },
      { key: 'D', label: '能不能安静听清每个细节', score: { calm: 3 } },
    ],
  },
  {
    order: 14,
    type: 'choice',
    primary: 'rhythm',
    title: '如果一首歌从头到尾都很慢，你会？',
    dims: ['rhythm', 'calm', 'lyric', 'texture'],
    options: [
      { key: 'A', label: '有点着急，想切掉', score: { rhythm: 3 } },
      { key: 'B', label: '正好，我就喜欢慢的', score: { calm: 3 } },
      { key: 'C', label: '看歌词写得好不好', score: { lyric: 3 } },
      { key: 'D', label: '看制作里有没有细节', score: { texture: 2 } },
    { key: 'E', label: '我其实不太被节奏带动', score: { rhythm: -3 } },
    ],
  },
  {
    order: 15,
    type: 'choice',
    primary: 'rhythm',
    title: '你手机里"跑步 / 通勤"这类按场景分的歌单多吗？',
    dims: ['rhythm', 'calm', 'novelty'],
    options: [
      { key: 'A', label: '好几个，专门按场景分', score: { rhythm: 3 } },
      { key: 'B', label: '有一两个', score: { rhythm: 1, calm: 1 } },
      { key: 'C', label: '很少，我不按场景分', score: { novelty: 2 } },
      { key: 'D', label: '几乎不建歌单', score: { calm: 2 } },
    ],
  },

  // ══════════════════ lyric 文本共鸣（7 道） ══════════════════
  {
    order: 16,
    type: 'choice',
    primary: 'lyric',
    title: '会因为一句歌词把同一首歌反复听吗？',
    dims: ['lyric', 'melody', 'texture'],
    options: [
      { key: 'A', label: '经常，还会截图存下来', score: { lyric: 3 } },
      { key: 'B', label: '偶尔会，心里默念', score: { lyric: 2 } },
      { key: 'C', label: '很少，旋律抓住我就够了', score: { melody: 3 } },
      { key: 'D', label: '基本不记词，当背景听', score: { texture: 2, rhythm: 1 } },
    { key: 'E', label: '词写得好坏，我不太在意', score: { lyric: -3 } },
    ],
  },
  {
    order: 17,
    type: 'choice',
    primary: 'lyric',
    title: '一首歌让你觉得"它懂我"，靠的是？',
    dims: ['lyric', 'melody', 'texture', 'calm'],
    options: [
      { key: 'A', label: '词写的就是我想说的话', score: { lyric: 3 } },
      { key: 'B', label: '旋律正好落在那个情绪上', score: { melody: 3 } },
      { key: 'C', label: '编曲把情绪垫起来了', score: { texture: 3 } },
      { key: 'D', label: '声音一听就让人安心', score: { calm: 3 } },
    ],
  },
  {
    order: 18,
    type: 'choice',
    primary: 'lyric',
    title: '听外文歌的时候，你会去查歌词吗？',
    dims: ['lyric', 'texture', 'melody'],
    options: [
      { key: 'A', label: '会，一定要知道在唱什么', score: { lyric: 3 } },
      { key: 'B', label: '只查最喜欢的几首', score: { lyric: 2 } },
      { key: 'C', label: '不查，当人声乐器听', score: { texture: 3 } },
      { key: 'D', label: '无所谓，好听就行', score: { melody: 2 } },
    ],
  },
  {
    order: 19,
    type: 'choice',
    primary: 'lyric',
    title: '一首词很好但旋律普通的歌，你会？',
    dims: ['lyric', 'melody', 'calm'],
    options: [
      { key: 'A', label: '照样收藏，词就够了', score: { lyric: 3 } },
      { key: 'B', label: '听几次就放下了', score: { melody: 3 } },
      { key: 'C', label: '会自己改着哼', score: { melody: 2, novelty: 1 } },
      { key: 'D', label: '看当下的心情', score: { calm: 2 } },
    { key: 'E', label: '词我基本不抠，旋律顺耳就行', score: { lyric: -3 } },
    ],
  },
  {
    order: 20,
    type: 'choice',
    primary: 'lyric',
    title: '你写过、或者抄过歌词吗？',
    dims: ['lyric', 'calm', 'novelty'],
    options: [
      { key: 'A', label: '写过，或者抄在本子上', score: { lyric: 3 } },
      { key: 'B', label: '发过动态或者朋友圈', score: { lyric: 2, novelty: 1 } },
      { key: 'C', label: '只在心里想过', score: { calm: 2 } },
      { key: 'D', label: '没有过', score: { rhythm: 2, melody: 1 } },
    ],
  },
  {
    order: 21,
    type: 'choice',
    primary: 'lyric',
    title: '一首歌的"叙事感"对你重要吗？',
    dims: ['lyric', 'texture', 'rhythm'],
    options: [
      { key: 'A', label: '重要，我喜欢有故事的歌', score: { lyric: 3 } },
      { key: 'B', label: '有一点，但别太啰嗦', score: { lyric: 1, melody: 1 } },
      { key: 'C', label: '不重要，我只要听感', score: { texture: 3 } },
      { key: 'D', label: '不重要，我要的是能跳起来', score: { rhythm: 3 } },
    ],
  },
  {
    order: 22,
    type: 'choice',
    primary: 'lyric',
    title: '哪种"一句话"最容易打动你？',
    dims: ['lyric', 'novelty', 'texture'],
    options: [
      { key: 'A', label: '写得很准，像在说我的事', score: { lyric: 3 } },
      { key: 'B', label: '写得很开阔，像电影台词', score: { lyric: 2, novelty: 1 } },
      { key: 'C', label: '写得怪，角度很新', score: { novelty: 3 } },
      { key: 'D', label: '我不太会被文字打动', score: { texture: 2, rhythm: 1 } },
    { key: 'E', label: '文字打动不了我，听着对味就行', score: { lyric: -3 } },
    ],
  },

  // ══════════════════ texture 音色质感（7 道） ══════════════════
  {
    order: 23,
    type: 'choice',
    primary: 'texture',
    title: '你会留意一首歌的"制作"吗？',
    dims: ['texture', 'melody', 'lyric', 'rhythm'],
    options: [
      { key: 'A', label: '会，能听出混音好不好', score: { texture: 3 } },
      { key: 'B', label: '有一点，糊了会难受', score: { texture: 2 } },
      { key: 'C', label: '不太留意，听歌不看这些', score: { melody: 2, lyric: 1 } },
      { key: 'D', label: '完全不在意', score: { rhythm: 2 } },
    { key: 'E', label: '制作细节我基本听不出来', score: { texture: -3 } },
    ],
  },
  {
    order: 24,
    type: 'choice',
    primary: 'texture',
    title: '同一个歌手换了制作人，你听得出来吗？',
    dims: ['texture', 'melody', 'lyric'],
    options: [
      { key: 'A', label: '听得出来，差别挺大', score: { texture: 3 } },
      { key: 'B', label: '隐约有点感觉', score: { texture: 2 } },
      { key: 'C', label: '听不出来', score: { melody: 2 } },
      { key: 'D', label: '我不关心是谁做的', score: { lyric: 2, rhythm: 1 } },
    ],
  },
  {
    order: 25,
    type: 'choice',
    primary: 'texture',
    title: '挑耳机、音箱的时候，你最看重？',
    dims: ['texture', 'rhythm', 'melody', 'calm'],
    options: [
      { key: 'A', label: '声场与解析，要听清层次', score: { texture: 3 } },
      { key: 'B', label: '低频够不够', score: { rhythm: 3 } },
      { key: 'C', label: '人声近不近，听抒情要贴耳', score: { melody: 3 } },
      { key: 'D', label: '能听就行', score: { calm: 2 } },
    ],
  },
  {
    order: 26,
    type: 'choice',
    primary: 'texture',
    title: '哪种声音特质会让你"耳朵一亮"？',
    dims: ['texture', 'novelty', 'rhythm', 'melody'],
    options: [
      { key: 'A', label: '特别的人声处理、和声堆叠', score: { texture: 3 } },
      { key: 'B', label: '没听过的合成器音色', score: { texture: 3, novelty: 1 } },
      { key: 'C', label: '一把干净的木吉他', score: { melody: 2, calm: 2 } },
      { key: 'D', label: '很硬很实的鼓', score: { rhythm: 3 } },
    { key: 'E', label: '音色变化我不太敏感', score: { texture: -3 } },
    ],
  },
  {
    order: 27,
    type: 'choice',
    primary: 'texture',
    title: '一首歌"听起来高级"，你觉得主要靠？',
    dims: ['texture', 'melody', 'lyric', 'rhythm'],
    options: [
      { key: 'A', label: '音色选择和空间感', score: { texture: 3 } },
      { key: 'B', label: '旋律写法', score: { melody: 3 } },
      { key: 'C', label: '词的水平', score: { lyric: 3 } },
      { key: 'D', label: '演奏水准', score: { rhythm: 2, melody: 1 } },
    ],
  },
  {
    order: 28,
    type: 'choice',
    primary: 'texture',
    title: '你会为"音质"这件事做额外的事吗（找无损、调均衡器）？',
    dims: ['texture', 'melody', 'calm', 'lyric'],
    options: [
      { key: 'A', label: '会，专门找无损、调过均衡器', score: { texture: 3 } },
      { key: 'B', label: '会换设备，但不折腾参数', score: { texture: 2 } },
      { key: 'C', label: '不会，手机外放也能听', score: { melody: 2, calm: 1 } },
      { key: 'D', label: '只在听某几首时才在意', score: { texture: 1, lyric: 1 } },
    ],
  },
  {
    order: 29,
    type: 'choice',
    primary: 'texture',
    title: '纯器乐、氛围类的音乐，你能听多久？',
    dims: ['texture', 'calm', 'melody', 'lyric'],
    options: [
      { key: 'A', label: '很久，我可以只听声音本身', score: { texture: 3, calm: 1 } },
      { key: 'B', label: '能听，但更习惯有唱', score: { melody: 2 } },
      { key: 'C', label: '听一会儿就走神', score: { lyric: 2, rhythm: 1 } },
      { key: 'D', label: '得配着做事才能听', score: { calm: 3 } },
    { key: 'E', label: '纯器乐我容易走神', score: { texture: -3 } },
    ],
  },

  // ══════════════════ novelty 探索欲（6 道） ══════════════════
  {
    order: 30,
    type: 'choice',
    primary: 'novelty',
    title: '你的歌单多久换一次？',
    dims: ['novelty', 'calm', 'lyric'],
    options: [
      { key: 'A', label: '一直在换，旧的很少回头', score: { novelty: 3 } },
      { key: 'B', label: '隔一阵加一批新的', score: { novelty: 2 } },
      { key: 'C', label: '挺稳定，就那些歌翻来覆去', score: { calm: 2, lyric: 1 } },
      { key: 'D', label: '基本不换', score: { calm: 3 } },
    { key: 'E', label: '换歌让我有点不安', score: { novelty: -3 } },
    ],
  },
  {
    order: 31,
    type: 'choice',
    primary: 'novelty',
    title: '看到一个完全陌生的歌手被推荐，你会？',
    dims: ['novelty', 'calm'],
    options: [
      { key: 'A', label: '直接点开听', score: { novelty: 3 } },
      { key: 'B', label: '先看一眼简介再说', score: { novelty: 2 } },
      { key: 'C', label: '先存着，以后有空再说', score: { calm: 2 } },
      { key: 'D', label: '一般不会点', score: { calm: 3 } },
    ],
  },
  {
    order: 32,
    type: 'choice',
    primary: 'novelty',
    title: '你愿意听完全听不懂的语言的歌吗？',
    dims: ['novelty', 'lyric', 'texture', 'calm'],
    options: [
      { key: 'A', label: '愿意，语言不重要', score: { novelty: 3 } },
      { key: 'B', label: '能接受，但会挑唱得好听的', score: { novelty: 2, texture: 1 } },
      { key: 'C', label: '还是想听懂在唱什么', score: { lyric: 3 } },
      { key: 'D', label: '不太愿意', score: { calm: 2 } },
    ],
  },
  {
    order: 33,
    type: 'choice',
    primary: 'novelty',
    title: '想"认识一种新风格"的时候，你会怎么找？',
    dims: ['novelty', 'lyric', 'calm'],
    options: [
      { key: 'A', label: '翻榜单、年度盘点', score: { novelty: 3 } },
      { key: 'B', label: '看乐评、长文推荐', score: { lyric: 2, novelty: 2 } },
      { key: 'C', label: '靠朋友推', score: { novelty: 1, calm: 1 } },
      { key: 'D', label: '不刻意找', score: { calm: 3 } },
    { key: 'E', label: '新风格我不太主动去碰', score: { novelty: -3 } },
    ],
  },
  {
    order: 34,
    type: 'choice',
    primary: 'novelty',
    title: '熟悉的老歌和陌生的新歌，你更常选哪边？',
    dims: ['novelty', 'calm', 'melody'],
    options: [
      { key: 'A', label: '陌生的，听新的才有意思', score: { novelty: 3 } },
      { key: 'B', label: '一半一半', score: { novelty: 1, calm: 1 } },
      { key: 'C', label: '老歌，熟的才安心', score: { calm: 3 } },
      { key: 'D', label: '看当下的心情', score: { melody: 2 } },
    ],
  },
  {
    order: 35,
    type: 'choice',
    primary: 'novelty',
    title: '一首歌"不好听但很特别"，你会？',
    dims: ['novelty', 'texture', 'melody', 'calm'],
    options: [
      { key: 'A', label: '收藏起来，过一阵再听', score: { novelty: 3 } },
      { key: 'B', label: '会研究它为什么这么写', score: { texture: 3, novelty: 1 } },
      { key: 'C', label: '听完就算，不会收藏', score: { melody: 2 } },
      { key: 'D', label: '直接切掉', score: { melody: 2, calm: 1 } },
    { key: 'E', label: '特别但不顺耳的，我一般直接划走', score: { novelty: -3 } },
    ],
  },

  // ══════════════════ calm 安静倾向（7 道） ══════════════════
  {
    order: 36,
    type: 'choice',
    primary: 'calm',
    title: '你理想的听歌场景是？',
    dims: ['calm', 'rhythm', 'melody'],
    options: [
      { key: 'A', label: '一个人戴耳机，关灯', score: { calm: 3 } },
      { key: 'B', label: '通勤路上塞着耳朵', score: { rhythm: 2, calm: 1 } },
      { key: 'C', label: '家里放着当背景', score: { calm: 2 } },
      { key: 'D', label: '和朋友一起，声音开大', score: { rhythm: 3 } },
    { key: 'E', label: '太安静我会觉得空', score: { calm: -3 } },
    ],
  },
  {
    order: 37,
    type: 'choice',
    primary: 'calm',
    title: '太吵的歌，你的第一反应是？',
    dims: ['calm', 'rhythm', 'texture'],
    options: [
      { key: 'A', label: '听不下去，会头疼', score: { calm: 3 } },
      { key: 'B', label: '看状态，偶尔能听', score: { rhythm: 1, calm: 1 } },
      { key: 'C', label: '挺爽的，我喜欢', score: { rhythm: 3 } },
      { key: 'D', label: '主要看编曲有没有层次', score: { texture: 2 } },
    ],
  },
  {
    order: 38,
    type: 'choice',
    primary: 'calm',
    title: '你会用音乐让自己"静下来"吗？',
    dims: ['calm', 'rhythm', 'melody'],
    options: [
      { key: 'A', label: '经常，睡前、发呆都会听', score: { calm: 3 } },
      { key: 'B', label: '偶尔', score: { calm: 2 } },
      { key: 'C', label: '我更多是用音乐提神', score: { rhythm: 3 } },
      { key: 'D', label: '不太会用音乐调状态', score: { melody: 2 } },
    ],
  },
  {
    order: 39,
    type: 'choice',
    primary: 'calm',
    title: '深夜听歌和白天听歌，对你差别大吗？',
    dims: ['calm', 'melody', 'rhythm'],
    options: [
      { key: 'A', label: '很大，深夜才听得进去', score: { calm: 3 } },
      { key: 'B', label: '有一点', score: { calm: 1, melody: 1 } },
      { key: 'C', label: '没差别', score: { melody: 2 } },
      { key: 'D', label: '我白天听得多，晚上早睡了', score: { rhythm: 2 } },
    { key: 'E', label: '白天晚上我都一样听', score: { calm: -3 } },
    ],
  },
  {
    order: 40,
    type: 'choice',
    primary: 'calm',
    title: '音量你一般开多大？',
    dims: ['calm', 'rhythm', 'texture'],
    options: [
      { key: 'A', label: '很小，够听就行', score: { calm: 3 } },
      { key: 'B', label: '中等', score: { calm: 1, melody: 1 } },
      { key: 'C', label: '偏大，要有包围感', score: { rhythm: 2, texture: 1 } },
      { key: 'D', label: '很大，越响越好', score: { rhythm: 3 } },
    ],
  },
  {
    order: 41,
    type: 'choice',
    primary: 'calm',
    title: '你更愿意去哪种现场？',
    dims: ['calm', 'rhythm', 'texture', 'melody'],
    options: [
      { key: 'A', label: '小场地，能坐着听', score: { calm: 3 } },
      { key: 'B', label: '音乐节，人多热闹', score: { rhythm: 3 } },
      { key: 'C', label: '剧院或者音乐厅', score: { calm: 2, texture: 1 } },
      { key: 'D', label: '我基本不去现场', score: { melody: 2 } },
    ],
  },
  {
    order: 42,
    type: 'choice',
    primary: 'calm',
    title: '一首歌循环很多次之后，你会？',
    dims: ['calm', 'novelty', 'texture', 'rhythm'],
    options: [
      { key: 'A', label: '还想再听，越听越有味道', score: { calm: 3 } },
      { key: 'B', label: '换个版本听（现场、翻唱）', score: { novelty: 2, texture: 1 } },
      { key: 'C', label: '听腻了，去找新的', score: { novelty: 3 } },
      { key: 'D', label: '听腻就切，但不影响喜欢', score: { rhythm: 2 } },
    { key: 'E', label: '循环多了我就想换口味', score: { calm: -3 } },
    ],
  },

  // ══════════════════ 听感题 8 道（每题放 30 秒片段） ══════════════════
  // 设计依据：Juslin & Västfjäll (2008) BRECVEMA —— brain stem reflex 与
  // rhythmic entrainment 是亚秒级起效的两条通路，所以 30 秒足够捕捉"第一反应"，
  // 而第一反应最不容易被"我应该喜欢什么"的社会期待污染。
  {
    order: 43,
    type: 'audio',
    primary: 'rhythm',
    audioRef: 'rhythm',
    title: '这段片段里，你第一下注意到的是？',
    dims: ['rhythm', 'melody', 'texture', 'calm'],
    options: [
      { key: 'A', label: '节奏的推进', score: { rhythm: 3 } },
      { key: 'B', label: '旋律的走向', score: { melody: 3 } },
      { key: 'C', label: '声音的质感与空间', score: { texture: 3 } },
      { key: 'D', label: '情绪上来了，想安静听下去', score: { calm: 3 } },
      /**
       * 第 5 个选项：**中立出口**（不给任何维度加分）。
       * 2026-09-22 用户："万一很像跟着唱这种该怎么选？还有就是完全无感甚至讨厌呢？"
       * —— 原来 4 个选项全是"正向偏好"，用户必须在四种喜欢里挑一种，测不出"不感冒"。
       * 加这一项后：不想选就选它，计分时它不贡献任何维度分（等于弃权），不会污染结果。
       * ⚠️ 只加在**听感题**上：听感是"当下反应"，本来就可能没感觉；
       *    选择题是"你的习惯"，都要有一点倾向，全给弃权口会让测评失真。
       */
      { key: 'E', label: NEUTRAL_LABEL, score: {} },
    ],
  },
  {
    order: 44,
    type: 'audio',
    primary: 'melody',
    audioRef: 'melody',
    title: '如果这段继续下去，你最希望它变成什么样？',
    dims: ['melody', 'rhythm', 'texture', 'calm'],
    options: [
      { key: 'A', label: '副歌再往上走一点', score: { melody: 3 } },
      { key: 'B', label: '鼓再重一点', score: { rhythm: 3 } },
      { key: 'C', label: '加一层和声或者合成器', score: { texture: 3 } },
      { key: 'D', label: '就这样别变', score: { calm: 3 } },
      /**
       * 第 5 个选项：**中立出口**（不给任何维度加分）。
       * 2026-09-22 用户："万一很像跟着唱这种该怎么选？还有就是完全无感甚至讨厌呢？"
       * —— 原来 4 个选项全是"正向偏好"，用户必须在四种喜欢里挑一种，测不出"不感冒"。
       * 加这一项后：不想选就选它，计分时它不贡献任何维度分（等于弃权），不会污染结果。
       * ⚠️ 只加在**听感题**上：听感是"当下反应"，本来就可能没感觉；
       *    选择题是"你的习惯"，都要有一点倾向，全给弃权口会让测评失真。
       */
      { key: 'E', label: NEUTRAL_LABEL, score: {} },
    ],
  },
  {
    order: 45,
    type: 'audio',
    primary: 'calm',
    audioRef: 'quiet',
    title: '这段让你想到的画面，更接近？',
    dims: ['calm', 'rhythm', 'lyric', 'melody'],
    options: [
      { key: 'A', label: '一个人夜里走路', score: { calm: 3 } },
      { key: 'B', label: '一群人在一起热闹', score: { rhythm: 3 } },
      { key: 'C', label: '电影里那种回忆的片段', score: { lyric: 3 } },
      { key: 'D', label: '说不清，就是好听', score: { melody: 3 } },
      /**
       * 第 5 个选项：**中立出口**（不给任何维度加分）。
       * 2026-09-22 用户："万一很像跟着唱这种该怎么选？还有就是完全无感甚至讨厌呢？"
       * —— 原来 4 个选项全是"正向偏好"，用户必须在四种喜欢里挑一种，测不出"不感冒"。
       * 加这一项后：不想选就选它，计分时它不贡献任何维度分（等于弃权），不会污染结果。
       * ⚠️ 只加在**听感题**上：听感是"当下反应"，本来就可能没感觉；
       *    选择题是"你的习惯"，都要有一点倾向，全给弃权口会让测评失真。
       */
      { key: 'E', label: NEUTRAL_LABEL, score: {} },
    ],
  },
  {
    order: 46,
    type: 'audio',
    primary: 'texture',
    audioRef: 'texture',
    title: '这一段里，最抓住你的"声音"是？',
    dims: ['texture', 'novelty', 'rhythm', 'melody'],
    options: [
      { key: 'A', label: '人声的处理方式', score: { texture: 3 } },
      { key: 'B', label: '某个没听过的音色', score: { texture: 3, novelty: 1 } },
      { key: 'C', label: '整体的律动', score: { rhythm: 3 } },
      { key: 'D', label: '旋律本身', score: { melody: 3 } },
      /**
       * 第 5 个选项：**中立出口**（不给任何维度加分）。
       * 2026-09-22 用户："万一很像跟着唱这种该怎么选？还有就是完全无感甚至讨厌呢？"
       * —— 原来 4 个选项全是"正向偏好"，用户必须在四种喜欢里挑一种，测不出"不感冒"。
       * 加这一项后：不想选就选它，计分时它不贡献任何维度分（等于弃权），不会污染结果。
       * ⚠️ 只加在**听感题**上：听感是"当下反应"，本来就可能没感觉；
       *    选择题是"你的习惯"，都要有一点倾向，全给弃权口会让测评失真。
       */
      { key: 'E', label: NEUTRAL_LABEL, score: {} },
    ],
  },
  {
    order: 47,
    type: 'audio',
    primary: 'melody',
    audioRef: 'melody',
    title: '听完这一段，你更想做什么？',
    dims: ['melody', 'rhythm', 'texture', 'calm'],
    options: [
      { key: 'A', label: '跟着哼两句', score: { melody: 3 } },
      { key: 'B', label: '跟着动起来', score: { rhythm: 3 } },
      { key: 'C', label: '查查是谁做的', score: { texture: 3 } },
      { key: 'D', label: '放进一个安静的深夜歌单', score: { calm: 3 } },
      /**
       * 第 5 个选项：**中立出口**（不给任何维度加分）。
       * 2026-09-22 用户："万一很像跟着唱这种该怎么选？还有就是完全无感甚至讨厌呢？"
       * —— 原来 4 个选项全是"正向偏好"，用户必须在四种喜欢里挑一种，测不出"不感冒"。
       * 加这一项后：不想选就选它，计分时它不贡献任何维度分（等于弃权），不会污染结果。
       * ⚠️ 只加在**听感题**上：听感是"当下反应"，本来就可能没感觉；
       *    选择题是"你的习惯"，都要有一点倾向，全给弃权口会让测评失真。
       */
      { key: 'E', label: NEUTRAL_LABEL, score: {} },
    ],
  },
  {
    order: 48,
    type: 'audio',
    primary: 'rhythm',
    audioRef: 'rhythm',
    // ⚠️ 原来是"鼓点进来的那一下" —— 万一音频里没有鼓（实测抽到过管弦乐纯音乐）就当场露馅。
    //    改成"节奏起来的时候"，对任何有律动的曲子都成立；同时 resolveAudio 会定向保证这首是节奏型。
    title: '节奏起来的时候，你的反应是？',
    dims: ['rhythm', 'melody', 'texture', 'calm'],
    options: [
      { key: 'A', label: '身体先动了', score: { rhythm: 3 } },
      { key: 'B', label: '注意到了，但没动', score: { texture: 2, melody: 1 } },
      { key: 'C', label: '觉得鼓可以再收一点', score: { calm: 3 } },
      { key: 'D', label: '开始去找旋律线', score: { melody: 3 } },
      /**
       * 第 5 个选项：**中立出口**（不给任何维度加分）。
       * 2026-09-22 用户："万一很像跟着唱这种该怎么选？还有就是完全无感甚至讨厌呢？"
       * —— 原来 4 个选项全是"正向偏好"，用户必须在四种喜欢里挑一种，测不出"不感冒"。
       * 加这一项后：不想选就选它，计分时它不贡献任何维度分（等于弃权），不会污染结果。
       * ⚠️ 只加在**听感题**上：听感是"当下反应"，本来就可能没感觉；
       *    选择题是"你的习惯"，都要有一点倾向，全给弃权口会让测评失真。
       */
      { key: 'E', label: NEUTRAL_LABEL, score: {} },
    ],
  },
  {
    order: 49,
    type: 'audio',
    primary: 'lyric',
    audioRef: 'vocal',
    title: '这一段里的人声给你什么感觉？',
    dims: ['lyric', 'texture', 'melody', 'novelty'],
    options: [
      { key: 'A', label: '像在跟我讲一件事', score: { lyric: 3 } },
      { key: 'B', label: '更像一件乐器', score: { texture: 3 } },
      { key: 'C', label: '有一点想跟着唱', score: { melody: 3 } },
      { key: 'D', label: '我更在意它后面的东西', score: { novelty: 3 } },
      /**
       * 第 5 个选项：**中立出口**（不给任何维度加分）。
       * 2026-09-22 用户："万一很像跟着唱这种该怎么选？还有就是完全无感甚至讨厌呢？"
       * —— 原来 4 个选项全是"正向偏好"，用户必须在四种喜欢里挑一种，测不出"不感冒"。
       * 加这一项后：不想选就选它，计分时它不贡献任何维度分（等于弃权），不会污染结果。
       * ⚠️ 只加在**听感题**上：听感是"当下反应"，本来就可能没感觉；
       *    选择题是"你的习惯"，都要有一点倾向，全给弃权口会让测评失真。
       */
      { key: 'E', label: NEUTRAL_LABEL, score: {} },
    ],
  },
  {
    order: 50,
    type: 'audio',
    primary: 'calm',
    audioRef: 'quiet',
    title: '这一段，你觉得最适合放在什么时候？',
    dims: ['calm', 'rhythm', 'texture', 'novelty'],
    options: [
      { key: 'A', label: '睡前', score: { calm: 3 } },
      { key: 'B', label: '开车或者走路上', score: { rhythm: 3 } },
      { key: 'C', label: '认真听细节的时候', score: { texture: 3 } },
      { key: 'D', label: '想找新歌的时候', score: { novelty: 3 } },
      /**
       * 第 5 个选项：**中立出口**（不给任何维度加分）。
       * 2026-09-22 用户："万一很像跟着唱这种该怎么选？还有就是完全无感甚至讨厌呢？"
       * —— 原来 4 个选项全是"正向偏好"，用户必须在四种喜欢里挑一种，测不出"不感冒"。
       * 加这一项后：不想选就选它，计分时它不贡献任何维度分（等于弃权），不会污染结果。
       * ⚠️ 只加在**听感题**上：听感是"当下反应"，本来就可能没感觉；
       *    选择题是"你的习惯"，都要有一点倾向，全给弃权口会让测评失真。
       */
      { key: 'E', label: NEUTRAL_LABEL, score: {} },
    ],
  },
];

/**
 * 6 个人格类型
 * ------------------------------------------------------------
 * dims 用**6 个计分维度**，每个型都有一个"独占峰"（=1 的那一维，别人都 ≤0.7），
 * 这是"6 个类型彼此可分"的关键；老版本用 4 维时 LYR / EXP 几乎匹配不到，就是缺这一条。
 * theory 字段保留文献出处，答辩时可以直接讲"这个类型对应哪条研究结论"。
 */
export const TYPES = [
  {
    code: 'MEL',
    name: '旋律捕手',
    description: '先记住旋律，再听其他。副歌能不能立住，决定了一切。',
    dims: { melody: 1, rhythm: 0.35, lyric: 0.5, texture: 0.45, novelty: 0.35, calm: 0.4 },
    theory: '偏高 Valence（Greenberg et al., 2016）与 Upbeat & Conventional 的旋律导向（Rentfrow & Gosling, 2003）',
    listeningProfile: '一句话就能哼出来的歌最抓他；不在意是不是最新、是不是最吵，只要旋律立得住。',
    albumHints: ['旋律密度高、副歌记忆点强', '流行／民谣／抒情为主', '不追求极端安静或极端躁动'],
  },
  {
    code: 'RHY',
    name: '节拍动物',
    description: '身体先有反应，脑子后到。鼓点一进来就想动。',
    dims: { melody: 0.45, rhythm: 1, lyric: 0.2, texture: 0.35, novelty: 0.4, calm: 0.12 },
    theory: '高 Arousal（Greenberg et al., 2016）＋ Energetic & Rhythmic 偏好（Rentfrow & Gosling, 2003）；主要靠 rhythmic entrainment 起反应（Juslin & Västfjäll, 2008）',
    listeningProfile: '低音和鼓组是主角；安静的歌反而让他坐不住。',
    albumHints: ['律动强、低频扎实', '舞曲／R&B／放克／摇滚', '适合运动或开车时放'],
  },
  {
    code: 'LYR',
    name: '词句收藏家',
    description: '歌词是一首歌的灵魂，会为了一句词反复听同一段。',
    dims: { melody: 0.7, rhythm: 0.25, lyric: 1, texture: 0.5, novelty: 0.35, calm: 0.5 },
    theory: '偏 Reflective & Complex 的文本/叙事取向（Rentfrow & Gosling, 2003），对应高 Depth（Greenberg et al., 2016）',
    listeningProfile: '会为了歌词去查翻译、会截图存句子；歌好不好听的一半在"写没写到我"。',
    albumHints: ['词写得讲究、有叙事', '唱作人／民谣／城市叙事', '值得反复读词的作品'],
  },
  {
    code: 'TMB',
    name: '音色控',
    description: '在意声音本身的质感，合成器、人声处理都能听出来。',
    dims: { melody: 0.55, rhythm: 0.35, lyric: 0.3, texture: 1, novelty: 0.6, calm: 0.35 },
    theory: '对应 MUSIC 模型里的 Sophisticated（Rentfrow, Goldberg & Levitin, 2011），高 Depth ＋ 审美判断机制（Juslin 等，2013）',
    listeningProfile: '听的是"怎么录的、怎么混的"；同一首歌换个制作人能听出差别。',
    albumHints: ['制作精良、音色设计突出', '电子／另类／实验流行', '有明确声音美学的作品'],
  },
  {
    code: 'CLM',
    name: '安静聆听者',
    description: '要的是氛围，不是信息量。适合一个人戴耳机听。',
    dims: { melody: 0.5, rhythm: 0.12, lyric: 0.45, texture: 0.4, novelty: 0.25, calm: 1 },
    theory: '对应 MUSIC 模型里的 Mellow（Rentfrow et al., 2011），低 Arousal（Greenberg et al., 2016）',
    listeningProfile: '夜深了才听得进去；音量不大，能一个人待着就好。',
    albumHints: ['氛围感强、编制克制', '民谣／爵士／氛围／原声', '适合夜里、适合独处'],
  },
  {
    code: 'EXP',
    name: '探索者',
    description: '越没听过越有兴趣，重复的歌单会让你难受。',
    dims: { melody: 0.5, rhythm: 0.45, lyric: 0.3, texture: 0.6, novelty: 1, calm: 0.18 },
    theory: '两篇 Rentfrow 研究都把音乐偏好与"开放性"绑在一起（Rentfrow & Gosling, 2003；Rentfrow et al., 2011），本型即 Openness to Experience 的音乐侧写',
    listeningProfile: '歌单一直在换；不怕难听，怕的是重复。',
    albumHints: ['风格少见、有实验性', '跨界或地域色彩强', '探索型听众会写进"年度发现"的作品'],
  },
];

export default {
  DIMS,
  DIM_LABELS,
  DISPLAY_DIMS,
  DISPLAY_DIM_LABELS,
  QUESTIONS,
  NEUTRAL_LABEL,
  NEUTRAL_KEY,
  TYPES,
  DEPRECATED_TYPE_CODES,
  SAMPLE_RULE,
  SAMPLE_LIMITS,
  AUDIO_TAG_GENRE,
};
