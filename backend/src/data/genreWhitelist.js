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
};

/** 流派键 → 还要并进哪些附加名单 */
export const EXTRA_MERGE = {
  国语流行乐: ['华语新生代'],
  广东歌香港流行乐: ['华语乐队'],
  摇滚: ['华语乐队'],
  另类音乐: ['华语乐队'],
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
};

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
function softName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** 白名单全量名字集合（宽松归一化）—— 判定"是不是白名单里的知名歌手" */
export const WHITELIST_NAME_SET = new Set(
  [...Object.values(GENRE_WHITELIST), ...Object.values(EXTRA_LISTS)]
    .flat()
    .map(softName)
    .filter(Boolean),
);

/**
 * 某位歌手是否属于白名单（即"够大牌"）。用于流派/年代池的"知名歌手优先"排序。
 * 判定：① 宽松归一化后完全相等；② 该歌手名 = 白名单名 + 空格/左括号起头
 *      （覆盖 `周杰倫 (Jay Chou)`、`MC HotDog 熱狗 Live` 这类带后缀的写法）。
 * ⚠️ 不做"无边界前缀"匹配：否则 `Nas` 会命中 `Nasdaq`、`PSY` 会命中 `Psychedelic Furs`。
 */
export function isWhitelistedArtist(name) {
  const n = softName(name);
  if (!n) return false;
  if (WHITELIST_NAME_SET.has(n)) return true;
  for (const w of WHITELIST_NAME_SET) {
    if (n.startsWith(`${w} `) || n.startsWith(`${w}(`)) return true;
  }
  return false;
}

/**
 * 取某个流派在"补足"时该用的名字清单 = 主名单 + 该流派并进来的附加名单（按顺序、去重）。
 * 库里出现表外的流派标签时返回空数组（调用方会退回关键词源，行为与改动前一致）。
 */
export function whitelistNamesFor(genre, normalizeGenre) {
  const raw = normalizeGenre(genre);
  if (!raw) return [];
  const key = CANON[raw] || raw;
  const main = GENRE_WHITELIST[key];
  if (!main) return [];
  const extras = (MERGE_BY_KEY[key] || []).flatMap((n) => EXTRA_LISTS[n] || []);
  return [...new Set([...main, ...extras])];
}

