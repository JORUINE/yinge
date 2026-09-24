/**
 * 流派知名歌手白名单（2026-09-23 用户确认落地）
 * ============================================================
 * 起因（用户原话）："怎么韩国流行乐出来一堆莫名其妙的歌手"、"像说唱这里
 * 一个出名的大牌歌手都没有，你的榜单歌手都从哪里来的"。
 *
 * 根因（scripts/diag-genres.mjs 实测）：Apple 的"流派榜单"（topalbums by genre）
 * 回答的是**"此刻在卖什么"** —— 冷门新专、地区榜歌手会挤掉常青大牌。
 * 所以榜单不能用来看"谁是这个流派的大牌"。
 *
 * 用户拍板的方案：**榜单 + 人工白名单兜底**。
 *   ① 榜单照旧先跑（真实销量/播放排序，管"热"）；
 *   ② 榜单没凑够 limit 时，**优先按本名单逐个去 iTunes 搜人**（管"够大牌"）；
 *   ③ 还不足才退回原来的关键词源。
 *   → 见 genreExpand.discoverGenreArtists 的 ①-c 分支。
 *
 * ⚠️ 这份名单只影响"发现歌手"这一步：不参与计分、不改赛制、不改封顶。
 * ⚠️ 名单里写的是**检索用名字**（iTunes 搜得到的写法），不是展示名：
 *    欧美用本名、华语台港用繁体、日韩用原文（日文/韩文）。搜不到的名字会被静默跳过。
 *
 * 键 = normalizeGenre() 之后的结果（见 genreExpand.normalizeGenre）：
 *   去空格/斜杠/连字符 + 转小写。所以「Hip-Hop/Rap」→ 'hiphoprap'。
 */

/* ------------------------------------------------------------------
 * 一、按流派的主名单
 * ------------------------------------------------------------------ */
export const GENRE_WHITELIST = {
  /* ── 欧美流行 ── */
  流行乐: [
    'Taylor Swift', 'Ed Sheeran', 'Adele', 'Bruno Mars', 'Ariana Grande',
    'Billie Eilish', 'Dua Lipa', 'The Weeknd', 'Justin Bieber', 'Harry Styles',
    'Olivia Rodrigo', 'Sabrina Carpenter', 'Miley Cyrus', 'Lady Gaga', 'Katy Perry',
    'Rihanna', 'Beyoncé', 'Maroon 5', 'Charlie Puth', 'Shawn Mendes',
  ],

  /* ── 华语国语 ── */
  国语流行乐: [
    '周杰倫', '林俊傑', '王力宏', '陶喆', '方大同',
    '孫燕姿', '蔡依林', '張惠妹', '五月天', '梁靜茹',
    '田馥甄', '張韶涵', '鄧紫棋', '李榮浩', '薛之謙',
    '毛不易', '陳奕迅', '劉若英', '光良', '范瑋琪',
  ],

  /* ── 粤语 ── */
  广东歌香港流行乐: [
    '陳奕迅', '容祖兒', '楊千嬅', '古巨基', '李克勤',
    '譚詠麟', '張國榮', '梅艷芳', '張學友', '鄭秀文',
    '劉德華', '謝霆鋒', '張敬軒', '衛蘭', '側田',
    '陳慧嫻', 'Beyond', '林子祥', '關淑怡', '麥浚龍',
  ],

  /* ── 说唱 ── */
  hiphoprap: [
    'Drake', 'Kendrick Lamar', 'J. Cole', 'Kanye West', 'Travis Scott',
    'Eminem', 'JAY-Z', 'Nicki Minaj', 'Future', '21 Savage',
    'Lil Wayne', 'Tyler, The Creator', 'A$AP Rocky', 'Cardi B', 'Post Malone',
    'Metro Boomin', 'Doja Cat', 'Nas', '50 Cent', 'Playboi Carti',
  ],
  华语hiphop: [
    'MC HotDog 熱狗', '蛋堡', '頑童MJ116', 'GAI', '馬思唯',
    '萬妮達', '謝帝', '派偉俊', '玖壹壹', '王以太',
    '那吾克熱', 'VAVA', '艾熱', 'Bridge 布瑞吉', 'ØZI',
  ],

  /* ── R&B / Soul ── */
  'r&b骚灵乐': [
    'Frank Ocean', 'SZA', 'Alicia Keys', 'Usher', 'Chris Brown',
    'H.E.R.', 'Daniel Caesar', 'Jhené Aiko', 'Summer Walker', 'Brent Faiyaz',
    'Anderson .Paak', 'John Legend', 'Miguel', 'Kali Uchis', 'Steve Lacy',
    'Giveon', 'Khalid', 'Luther Vandross', 'Marvin Gaye', 'Stevie Wonder',
  ],

  /* ── K-Pop / J-Pop ── */
  韩国流行乐: [
    'BTS', 'BLACKPINK', 'TWICE', 'EXO', 'SEVENTEEN',
    'IU', 'aespa', 'IVE', 'NewJeans', 'Stray Kids',
    'NCT 127', 'Red Velvet', '(G)I-DLE', 'LE SSERAFIM',
    'TOMORROW X TOGETHER', 'ITZY', 'BIGBANG', 'PSY',
  ],
  日本流行乐: [
    '米津玄師', 'YOASOBI', 'ヨルシカ', 'Official髭男dism', 'あいみょん',
    '宇多田ヒカル', 'King Gnu', 'Aimer', '藤井風', 'LiSA',
    'Ado', 'Vaundy', 'RADWIMPS', 'Mrs. GREEN APPLE', '星野源',
    'back number',
  ],

  /* ── 摇滚系 ── */
  摇滚: [
    'The Beatles', 'Queen', 'Led Zeppelin', 'Pink Floyd', 'Nirvana',
    'Radiohead', 'Muse', 'Coldplay', 'Arctic Monkeys', 'The Rolling Stones',
    'AC/DC', "Guns N' Roses", 'Linkin Park', 'Green Day', 'Foo Fighters',
    'Oasis', 'U2', 'Red Hot Chili Peppers', 'Metallica', 'Bon Jovi',
  ],
  硬摇滚: [
    'AC/DC', "Guns N' Roses", 'Metallica', 'Mötley Crüe', 'Def Leppard',
    'Van Halen', 'Black Sabbath', 'Deep Purple', 'Aerosmith', 'Iron Maiden',
    'Scorpions', 'Judas Priest', 'Whitesnake', 'KISS', 'Skid Row', 'Alice Cooper',
  ],
  另类音乐: [
    'Radiohead', 'Coldplay', 'Muse', 'The Killers', 'Imagine Dragons',
    'Twenty One Pilots', 'Vampire Weekend', 'Tame Impala', 'Gorillaz', 'The 1975',
    'Lana Del Rey', 'Hozier', 'Foster The People', 'MGMT', 'Beach House',
    'The Strokes', 'Interpol', 'Blur',
  ],

  /* ── 电子 / 舞曲 ── */
  电子音乐: [
    'Daft Punk', 'Aphex Twin', 'Deadmau5', 'Flume', 'Four Tet',
    'The Chemical Brothers', 'Fatboy Slim', 'Disclosure', 'ODESZA', 'Fred again..',
    'Porter Robinson', 'Massive Attack', 'Bonobo', 'Jamie xx', 'Justice',
  ],
  舞曲: [
    'Calvin Harris', 'David Guetta', 'Avicii', 'Martin Garrix', 'Zedd',
    'Tiësto', 'The Chainsmokers', 'Kygo', 'Alan Walker', 'Marshmello',
    'Swedish House Mafia', 'Major Lazer', 'Afrojack', 'Steve Aoki', 'Alesso',
    'Robin Schulz', 'Lost Frequencies',
  ],

  /* ── 爵士 ── */
  爵士: [
    'Miles Davis', 'John Coltrane', 'Bill Evans', 'Ella Fitzgerald', 'Louis Armstrong',
    'Duke Ellington', 'Chet Baker', 'Billie Holiday', 'Herbie Hancock', 'Thelonious Monk',
    'Dave Brubeck', 'Nina Simone', 'Oscar Peterson', 'Stan Getz', 'Keith Jarrett',
    'Pat Metheny', 'Norah Jones', 'Diana Krall', 'Charlie Parker', 'Sonny Rollins',
  ],

  /* ── 古典 / 器乐 ── */
  古典乐: [
    'Beethoven', 'Mozart', 'Bach', 'Chopin', 'Tchaikovsky',
    'Vivaldi', 'Debussy', 'Brahms', 'Liszt', 'Rachmaninoff',
    'Schubert', 'Handel', 'Mahler', 'Dvořák', 'Erik Satie',
    'Yo-Yo Ma', '郎朗', '王羽佳',
  ],
  器乐: [
    'Max Richter', 'Ólafur Arnalds', 'Ludovico Einaudi', '久石譲', '坂本龍一',
    'Yiruma', 'Kitaro', 'Vangelis', 'Philip Glass', 'Steve Reich',
    'Nils Frahm', 'Hania Rani', 'Joep Beving', 'Bruno Sanfilippo',
  ],

  /* ── 民谣 / 乡村 ── */
  民谣: [
    'Bob Dylan', 'Simon & Garfunkel', 'Joni Mitchell', 'Leonard Cohen', 'Nick Drake',
    'Cat Stevens', 'Joan Baez', 'Damien Rice', 'José González', 'Sufjan Stevens',
    'Fleet Foxes', 'Bon Iver', 'The Lumineers', 'Mumford & Sons',
    '宋冬野', '趙雷', '李志', '馬頔', '堯十三', '樸樹',
  ],
  乡村: [
    'Johnny Cash', 'Dolly Parton', 'Willie Nelson', 'Taylor Swift', 'Chris Stapleton',
    'Luke Combs', 'Morgan Wallen', 'Kacey Musgraves', 'Blake Shelton', 'Carrie Underwood',
    'Keith Urban', 'Tim McGraw', 'Faith Hill', 'Shania Twain', 'Garth Brooks',
    'Alan Jackson', 'Kenny Rogers', 'Reba McEntire', 'Miranda Lambert', 'Brad Paisley',
  ],

  /* ── 节庆 / 配乐 ── */
  节庆: [
    'Mariah Carey', 'Michael Bublé', 'Wham!', 'Bing Crosby', 'Nat King Cole',
    'Frank Sinatra', 'Pentatonix', 'Josh Groban', 'Celine Dion', 'Dean Martin',
    'Andy Williams', 'John Lennon', 'Brenda Lee', 'Bobby Helms', 'Sia', 'Sam Smith',
  ],
  原声配乐: [
    'Hans Zimmer', 'John Williams', 'Ennio Morricone', 'Alexandre Desplat', 'Danny Elfman',
    'Michael Giacchino', 'Howard Shore', 'Alan Silvestri', 'Ludwig Göransson',
    'Trent Reznor & Atticus Ross', 'Ramin Djawadi', 'Max Richter', 'Ólafur Arnalds',
    'Jóhann Jóhannsson', 'Thomas Newman', 'James Horner',
    '久石譲', '坂本龍一', '澤野弘之', '菅野よう子',
  ],
};

/* ------------------------------------------------------------------
 * 二、附加名单（不是 iTunes 流派，按需并入上面的键）
 * ------------------------------------------------------------------
 * 用户 2026-09-23 点名要的两份：
 *   · 华语新生代 —— 国语流行那 20 位偏 2000-2015，新生代单独一册；
 *   · 华语乐队   —— "什么告五人啊这种乐队" 单独一册（告/五/人 是台湾独立乐团）。
 * 这两册都不是 Apple 的流派标签，所以靠 EXTRA_MERGE 挂到合适的流派上。
 */
export const EXTRA_LISTS = {
  华语新生代: [
    '周興哲', '韋禮安', '徐佳瑩', '艾怡良', '孫盛希',
    '9m88', '高爾宣', '吳青峰', '家家', '李佳薇',
    '王詩安', '陳零九', '邱鋒澤', '婁峻碩', '持修',
    '熊仔', '李浩瑋', '魏如萱', '鄭宜農', '柯智棠',
  ],
  华语乐队: [
    // 台湾
    '五月天', '蘇打綠', '告五人', '茄子蛋', '老王樂隊',
    '宇宙人', '麋先生', '理想混蛋', '落日飛車', '草東沒有派對',
    '溫室雜草', '傷心欲絕', '美秀集團', '椅子樂團', '大象體操',
    // 香港
    'Dear Jane', 'RubberBand', 'Supper Moment', 'ToNick',
    // 内地
    '萬能青年旅店', '痛仰', '新褲子', '五條人', '二手玫瑰',
    '刺蝟', '逃跑計劃', '房東的貓', '好妹妹', '後海大鯊魚',
  ],
  /**
   * 粤语乐队（= 华语乐队的**港澳子集**）
   * ------------------------------------------------------------
   * 2026-09-23 用户报「点开广东流行乐查看有哪些歌手，出来一堆其他类型的」——
   * 因为原来把**整个**华语乐队册（含五月天/苏打绿/告五人 等国语团）都并进了粤语流派。
   * 现在拆开：粤语流派只并这一册（港澳团），国语团归「摇滚 / 另类音乐」。
   */
  粤语乐队: [
    'Dear Jane', 'RubberBand', 'Supper Moment', 'ToNick',
    'Kolor', '鐵樹蘭', 'Zpecial', 'Nowhere Boys', 'My Little Airport', '觸執毛',
  ],
};

/** 流派键 → 还要并进哪些附加名单 */
export const EXTRA_MERGE = {
  国语流行乐: ['华语新生代'],
  /**
   * ⚠️ 2026-09-23 用户报「我点开广东流行乐查看有哪些歌手，出来一堆其他类型的」——
   * 根因就是这里原来把「华语乐队」并进了「广东歌香港流行乐」：
   * 于是粤语流派的名单里混进了五月天 / 苏打绿 / 告五人 / 万能青年旅店 这些国语乐团。
   * 已移除。乐队册只并入「摇滚」「另类音乐」，不再碰粤语。
   */
  // 粤语流派只并「粤语乐队」（港澳团）—— 不并国语团，否则又会混进五月天那批
  广东歌香港流行乐: ['粤语乐队'],
  摇滚: ['华语乐队', '粤语乐队'],
  另类音乐: ['华语乐队', '粤语乐队'],
};

/* ------------------------------------------------------------------
 * 三、工具函数
 * ------------------------------------------------------------------ */

/**
 * 库里那些流派名的**繁简/变体 → 规范键**映射。
 * ⚠️ 这是自检抓出来的坑：iTunes 给港台歌手打的标签是**繁体**（「搖滾」「韓國流行樂」
 *    「廣東歌/香港流行樂」），而本文件的键按简体写 → 精确命中不了，
 *    白名单静默失效（`whitelistNamesFor` 返回空）。与 GENRE_ALIAS 双写法同一个坑。
 * 取值必须是 GENRE_WHITELIST 里真实存在的键（自检脚本会校验）。
 */
const CANON = {
  韓國流行樂: '韩国流行乐',
  國語流行樂: '国语流行乐',
  廣東歌香港流行樂: '广东歌香港流行乐',
  搖滾: '摇滚',
  硬搖滾: '硬摇滚',
  另類音樂: '另类音乐',
  電子音樂: '电子音乐',
  古典樂: '古典乐',
  器樂: '器乐',
  民謠: '民谣',
  鄉村: '乡村',
  節慶: '节庆',
  原聲配樂: '原声配乐',
  華語hiphop: '华语hiphop',
  'r&b騷靈樂': 'r&b骚灵乐',
  '當代r&b': 'r&b骚灵乐',
  日本流行樂: '日本流行乐',
  // 变体：只写 Hip-Hop 时也走说唱那一册
  hiphop: 'hiphoprap',
  /* ── 策展流派（不是 iTunes 标签，歌手集合由白名单直接定义）── */
  華語新生代: '华语新生代',
  华语新人: '华语新生代',
  华语新声: '华语新生代',
  新生代: '华语新生代',
  華語樂隊: '华语乐队',
  華語樂團: '华语乐队',
  华语乐团: '华语乐队',
  中文乐队: '华语乐队',
  中文樂隊: '华语乐队',
  /* ── 灌库后新冒出来的标签（2026-09-23 实跑白名单预灌脚本后库里新增的写法）──
     统一按"它其实是哪个流派"归位，避免这些流派掉进"表外 → 退回 Apple 搜索"。 */
  饒舌: 'hiphoprap',
  饶舌: 'hiphoprap',
  独立摇滚: '另类音乐',
  獨立搖滾: '另类音乐',
  前卫摇滚艺术摇滚: '摇滚',
  前衛搖滾藝術搖滾: '摇滚',
  摇滚乐: '摇滚',
  搖滾樂: '摇滚',
  成人当代: '流行乐',
  成人當代: '流行乐',
  另类民谣: '民谣',
  另類民謠: '民谣',
  电视原声带: '原声配乐',
  電視原聲帶: '原声配乐',
  流行乐摇滚: '流行乐',
  流行樂搖滾: '流行乐',
  华语音乐: '国语流行乐',
  華語音樂: '国语流行乐',
};

/**
 * 繁 → 简 逐字兜底表（2026-09-23 自检抓到的 bug 的通用解法）
 * ------------------------------------------------------------
 * 用户报「你白名单里写的好好的流行乐 pop 这里也没有」——
 * 根因：库里标签是 **繁体**「流行樂」，而白名单键按简体写「流行乐」，
 * CANON 里**恰好漏了这一个**，于是 `whitelistNamesFor('流行樂')` 返回空、
 * 白名单静默失效、退回 Apple 榜单（于是出来 Charli xcx / BABYLONSTER 那批）。
 * 逐个手写 CANON 迟早再漏，所以改成"逐字繁简兜底 + CANON 特例优先"：
 * 任何繁体流派名都会先被逐字转简，再查白名单，**结构上不可能再漏**。
 */
const T2S = {
  樂: '乐', 語: '语', 國: '国', 華: '华', 廣: '广', 東: '东', 團: '团', 隊: '队',
  節: '节', 慶: '庆', 電: '电', 聲: '声', 韻: '韵', 藍: '蓝', 調: '调', 搖: '摇',
  滾: '滚', 鄉: '乡', 謠: '谣', 類: '类', 曲: '曲', 醫: '医', 劇: '剧', 藝: '艺',
};
function toSimplified(s) {
  return String(s).replace(/[樂語國華廣東團隊節慶電聲韻藍調搖滾鄉謠類劇藝]/g, (c) => T2S[c] || c);
}

/** 流派词 → 白名单规范键：CANON 特例优先，其次逐字繁转简，最后原样返回 */
function canonKey(raw) {
  if (CANON[raw]) return CANON[raw];
  const s = toSimplified(raw);
  if (CANON[s]) return CANON[s];
  return s;
}

/**
 * 对外暴露的规范键（2026-09-23）
 * ------------------------------------------------------------
 * 归一化与 `genreExpand.normalizeGenre` 完全同口径（去空格/斜杠/连字符 + 小写 + ＆→&），
 * 这里自己实现一遍是为了**不引入反向依赖**（genreExpand 已经 import 本文件）。
 * 用途：listGenres / resolvePool / discoverGenreArtists 三处**共用同一张嘴**，
 * 保证「界面上的流派」「池子里匹配的歌手」「白名单用哪一册」三者口径一致 ——
 * 用户报的「为什么你流行乐里有粤语歌手」就是因为其中一处用了子串正则。
 */
export function canonicalGenreKey(genre) {
  const raw = String(genre || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/\\_·・－-]+/g, '')
    .replace(/＆/g, '&');
  if (!raw) return '';
  return canonKey(raw);
}

/** 这个规范键有没有白名单覆盖（有 = 值得在界面上列出来） */
export function isWhitelistCovered(key) {
  return Boolean(GENRE_WHITELIST[key] || EXTRA_LISTS[key]);
}

/**
 * 策展流派（歌手集合完全由白名单定义，不来自 iTunes 流派标签）——
 * 界面固定挂这两个入口，放在流派列表最前。
 */
export const CURATED_GENRES = [
  { key: '华语新生代', label: '華語新生代' },
  { key: '华语乐队', label: '華語樂隊' },
];
export const CURATED_KEYS = CURATED_GENRES.map((c) => c.key);

/**
 * 界面展示名（2026-09-23 用户："不需要这么多流派，保留白名单里的这些就行了"）
 * ------------------------------------------------------------
 * ⚠️ 这是**界面上流派名的唯一真相源**：
 *    以前展示名是从 DB 标签里挑"歌手最多的那个写法"，于是灌库后新标签一多，
 *    列表就开始漂（同一个流派换名字 / 多出别名格子）。
 *    现在固定成这张表 —— 一个白名单册 = 一个 chip、一个名字，与库里标签怎么变无关。
 */
export const WHITELIST_GENRE_DISPLAY = {
  流行乐: '流行樂',
  国语流行乐: '國語流行樂',
  广东歌香港流行乐: '廣東歌/香港流行樂',
  hiphoprap: 'Hip-Hop/Rap',
  华语hiphop: '華語 Hip-Hop',
  'r&b骚灵乐': 'R&B/騷靈樂',
  韩国流行乐: '韓國流行樂',
  日本流行乐: '日本流行樂',
  摇滚: '搖滾',
  硬摇滚: '硬搖滾',
  另类音乐: '另類音樂',
  电子音乐: '電子音樂',
  舞曲: '舞曲',
  爵士: '爵士',
  古典乐: '古典樂',
  器乐: '器樂',
  民谣: '民謠',
  乡村: '鄉村',
  节庆: '節慶',
  原声配乐: '原聲配樂',
};

/** 界面上要列出的流派（策展流派排最前，其余按固定顺序） */
export function whitelistGenreEntries() {
  const curated = CURATED_GENRES.map((c) => ({ key: c.key, label: c.label, curated: true }));
  const rest = Object.keys(WHITELIST_GENRE_DISPLAY).map((key) => ({
    key,
    label: WHITELIST_GENRE_DISPLAY[key],
    curated: false,
  }));
  return [...curated, ...rest];
}

/** 派生的「并进哪册」映射：规范键 → 附加册（含 CANON 反向补齐的繁体键） */
const MERGE_BY_KEY = (() => {
  const out = { ...EXTRA_MERGE };
  for (const [variant, canon] of Object.entries(CANON)) {
    if (EXTRA_MERGE[canon] && !out[variant]) out[variant] = EXTRA_MERGE[canon];
  }
  return out;
})();

/** 名字归一化（严格）：小写、去空格与常见标点 —— 用于"同一册内是否重复"这类判定 */
export function normArtistName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^(the)\s+/i, '')
    .replace(/[\s\u3000·・.,&'’`\-_/\\()[\]（）【】!！?？:：;；+&]/g, '');
}

/**
 * 名字归一化（宽松）：只小写 + 折叠空白。
 * 为什么宽松版也要留：**前缀匹配**必须靠"空格 / 左括号"这个边界，
 * 严格版把标点全删了，`周杰倫 (Jay Chou)` 会变成 `周杰倫jaychou`，
 * 与 `周杰倫` 只差三个字母却看不出边界 —— 会误判也会漏判。
 */
export function softNameOf(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 名字变体别名组（2026-09-23 第十二批）
 * ------------------------------------------------------------
 * 真因：iTunes **hk 区**返回的是当地译名 / 罗马字，与白名单写的中/日原名**字符级对不上**，
 *   而 `sameArtistName` 只做字符匹配 → 白名单那册人"灌进库了却数不到"（表现为 chip 显示 0/N 位）。
 *   实测（灌库后库里实际存的写法）：
 *     白名单 `BTS`             ↔ 库里 `防彈少年團`
 *     白名单 `ヨルシカ`         ↔ 库里 `Yorushika`
 *     白名单 `宇多田ヒカル`      ↔ 库里 `宇多田光`
 *     白名单 `Official髭男dism` ↔ 库里 `Official鬍子男dism`
 * 口径：**同一组内任意两个名字都视为同一歌手**（双向生效），先查别名表、再走字符分级匹配。
 *   ⚠️ 只写"确实是同一个人"的写法；不要写近似但不同的歌手（否则会张冠李戴）。
 */
const NAME_ALIAS_GROUPS = [
  ['BTS', '防彈少年團', '방탄소년단', 'Bangtan Boys', 'Beyond The Scene'],
  ['ヨルシカ', 'Yorushika'],
  ['宇多田ヒカル', '宇多田光', 'Hikaru Utada'],
  ['Official髭男dism', 'Official鬍子男dism', 'OFFICIAL HIGE DANDISM'],
  ['米津玄師', 'Kenshi Yonezu'],
  ['あいみょん', 'Aimyon'],
  ['藤井風', 'Fujii Kaze'],
];
/** 名字（宽松归一化）→ 组号 */
const NAME_ALIAS_INDEX = (() => {
  const m = new Map();
  NAME_ALIAS_GROUPS.forEach((group, i) => {
    for (const n of group) {
      const k = softNameOf(n);
      if (k) m.set(k, i);
    }
  });
  return m;
})();

/** 两个名字是否属于同一别名组（当地译名 / 罗马字差异） */
export function sameAliasGroup(a, b) {
  const x = NAME_ALIAS_INDEX.get(softNameOf(a));
  const y = NAME_ALIAS_INDEX.get(softNameOf(b));
  return x !== undefined && x === y;
}

/**
 * ⭐ 「白名单名字 → 已入库歌手」的**唯一判定入口**（2026-09-24 第十三批）
 * ------------------------------------------------------------
 * 为什么需要它（用户报「白名单里说没有 The Weeknd，下面却显示它已入库 168 张」）：
 *   同一个问题在**两处**用了**两种口径**——
 *     · `discoverGenreArtists` 拿 iTunes 搜到的 **artistId** 去库里查 → 说"已入库"；
 *     · `whitelistOfGenre` / 流派组池 / listGenres 计数 只比**名字** → 说"未入库"。
 *   而 iTunes **hk 区会把名字本地化**：The Weeknd→`威肯`、Maroon 5→`魔力紅`、
 *   房東的貓→`房东的猫`（繁简）、萬妮達→`万妮达`（繁简）……名字对不上就漏。
 * 做法：灌库脚本（seed-whitelist-artists.mjs）把**白名单里的写法**回写到 `artist.aliases`，
 *   这里连同 `name` 一起比对 → 全站口径统一，不再自相矛盾。
 * 注意：只用于"库里的歌手 vs 白名单名字"；iTunes 搜索结果与名字比（不知道 alias）用 `sameArtistName`。
 */
export function artistMatchesWhitelistName(artist, name) {
  if (!artist || !name) return false;
  if (sameArtistName(artist.name, name)) return true;
  return (artist.aliases || []).some((x) => sameArtistName(x, name));
}

/** 库里这位歌手是否命中这册白名单里的任意一个名字 */
export function artistMatchesAnyWhitelistName(artist, names) {
  if (!artist || !names || !names.length) return false;
  return names.some((n) => artistMatchesWhitelistName(artist, n));
}

/** 库里这位歌手是否算「白名单大牌」（含别名写法）—— 用于流派/年代池的"知名歌手优先"排序 */
export function isWhitelistedArtistDoc(artist) {
  if (!artist) return false;
  if (isWhitelistedArtist(artist.name)) return true;
  return (artist.aliases || []).some((x) => isWhitelistedArtist(x));
}


/** 白名单全量名字集合（宽松归一化）—— 判定"是不是白名单里的知名歌手"
 *  ⚠️ 2026-09-23：把**别名组里的写法**一并放进集合 —— 库里存的是当地译名（防彈少年團 / Yorushika），
 *  不收进来的话"知名歌手优先"排序会把它们当路人（与 sameArtistName 的口径不一致）。 */
export const WHITELIST_NAME_SET = new Set(
  [
    ...[...Object.values(GENRE_WHITELIST), ...Object.values(EXTRA_LISTS)].flat(),
    ...NAME_ALIAS_GROUPS.flat(),
  ]
    .map(softNameOf)
    .filter(Boolean),
);

/**
 * 某位歌手是否属于白名单（即"够大牌"）。用于流派/年代池的"知名歌手优先"排序。
 * 判定：① 宽松归一化后完全相等；② 该歌手名 = 白名单名 + 空格/左括号起头
 *      （覆盖 `周杰倫 (Jay Chou)`、`MC HotDog 熱狗 Live` 这类带后缀的写法）。
 * ⚠️ 不做"无边界前缀"匹配：否则 `Nas` 会命中 `Nasdaq`、`PSY` 会命中 `Psychedelic Furs`。
 */
export function isWhitelistedArtist(name) {
  const n = softNameOf(name);
  if (!n) return false;
  if (WHITELIST_NAME_SET.has(n)) return true;
  for (const w of WHITELIST_NAME_SET) {
    if (n.startsWith(`${w} `) || n.startsWith(`${w}(`)) return true;
  }
  return false;
}

/**
 * 取某个流派在"发现/组池"时该用的名字清单 = 主名单 + 该流派并进来的附加名单（按顺序、去重）。
 * 库里出现表外的流派标签时返回空数组（调用方会退回关键词源，行为与改动前一致）。
 * ⚠️ 2026-09-23 起，`EXTRA_LISTS` 里的册子**本身也能当流派用**（用户要求"流派里单开一个新生代"）——
 *    华语新生代 / 华语乐队不是 Apple 的流派标签，所以它们的歌手集合完全由本名单定义。
 */
export function whitelistNamesFor(genre, normalizeGenre) {
  const raw = normalizeGenre(genre);
  if (!raw) return [];
  const key = canonKey(raw);
  const main = GENRE_WHITELIST[key] || EXTRA_LISTS[key];
  if (!main) return [];
  const extras = (MERGE_BY_KEY[key] || []).flatMap((n) => EXTRA_LISTS[n] || []);
  return [...new Set([...main, ...extras])];
}

/** 只保留字母/数字/汉字（用于"字符多重集"比较） */
function bareChars(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** 名字是否同一个歌手（分级匹配，见 sameArtistName） */
export function sameArtistName(a, b) {
  const x = softNameOf(a);
  const y = softNameOf(b);
  if (!x || !y) return false;
  // A. 完全相等
  if (x === y) return true;
  // A2. 别名组（当地译名 / 罗马字差异，如 BTS ↔ 防彈少年團、宇多田ヒカル ↔ 宇多田光）
  if (sameAliasGroup(a, b)) return true;
  // B. 带后缀（`周杰倫 (Jay Chou)` / `MC HotDog 熱狗 Live`）
  if (x.startsWith(`${y} `) || x.startsWith(`${y}(`)) return true;
  if (y.startsWith(`${x} `) || y.startsWith(`${x}(`)) return true;
  /**
   * ⚠️ 2026-09-23 用户报「显示这个流派只有 3 个歌手，但是都入库了」——
   * 真因：白名单写的是 `MC HotDog 熱狗` / `那吾克熱` / `艾熱` / `Bridge 布瑞吉`，
   * 而库里存的是 iTunes 返回的 `MC HotDog` / `那吾克熱-NW` / `艾熱AIR` / `布瑞吉Bridge`，
   * 上面 A/B 两级一条都匹配不上 → 15 位只数到 6 位。
   * 所以补 C/D 两级（都有保守门槛，避免 `Nas` 误吃 `Nasdaq`、`GAI` 误吃 `Gaia`）：
   *   C. 去掉所有非字母数字汉字后，一方是另一方的**前缀**（短的那边：汉字≥2 或 拉丁≥4）
   *   D. 去掉标点后**字符多重集相同**（治 `Bridge 布瑞吉` ↔ `布瑞吉Bridge` 这种语序颠倒）
   */
  const bx = bareChars(x);
  const by = bareChars(y);
  if (!bx || !by) return false;
  const [short, long] = bx.length <= by.length ? [bx, by] : [by, bx];
  const cjkOnly = /^[\u4e00-\u9fff]+$/.test(short);
  if ((cjkOnly && short.length >= 2) || short.length >= 4) {
    if (long.startsWith(short)) return true;
    if (long.includes(short)) return true; // 中文片段包含（`熱狗` ⊂ `mchotdog熱狗`）
  }
  if (short.length >= 3 && [...short].sort().join('') === [...long].sort().join('')) return true;
  return false;
}

/**
 * 这个流派词是不是"策展流派"（歌手集合由白名单直接定义，不靠 iTunes 流派标签）。
 * 是则返回规范键（'华语新生代' / '华语乐队'），否则 null。
 * 用途：battle.service 组池时，策展流派走"按名字匹配已缓存歌手"，而不是 `genre` 正则。
 */
export function curatedListOf(genre, normalizeGenre) {
  const raw = normalizeGenre(genre);
  if (!raw) return null;
  const key = canonKey(raw);
  return EXTRA_LISTS[key] ? key : null;
}

