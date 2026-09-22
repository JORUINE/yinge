/**
 * 人格测评服务
 * 对应接口：P-01 ~ P-07
 */
import { PersonalityQuestion, PersonalityType, PersonalityResult, Album, AlbumTagVote, Track } from '../../models/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/http.js';
import * as musicService from '../music/music.service.js';
import {
  computeScores,
  maxByDim,
  normalizeScores,
  dimWeights,
  matchType,
  toDisplayDims,
  buildTemplateComment,
} from './scoring.js';
import { generateComment } from './qwen.client.js';
import { DIMS, SAMPLE_RULE, SAMPLE_LIMITS, AUDIO_TAG_GENRE, AUDIO_WHITELIST } from '../../data/personality.js';

/* ══════════════════════════════════════════════════════════════════════
 * 随机抽题（2026-09-22 新增）
 * ----------------------------------------------------------------------
 * 用户要求："题库可以扩充到 50，我们用随机题库，不然用户每次都一样"。
 * 但"随机"不能随便 —— 如果这一抽里"节奏"题占了 7 道、"文本"题只有 1 道，
 * 那这两维的分数根本没有可比性，结果会跟着运气漂。
 * 所以规则是：**抽哪几道随机，抽几道不随机**（见 SAMPLE_RULE）。
 * ══════════════════════════════════════════════════════════════════════ */

/** Fisher-Yates 洗牌（不改原数组） */
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 老数据可能没有 primary 字段 → 退回用 dims 的第一个维度 */
function primaryOf(q) {
  if (q.primary && DIMS.includes(q.primary)) return q.primary;
  const first = (q.dims || []).find((d) => DIMS.includes(d));
  return first || 'melody';
}

/**
 * 听感题抽 4 道，尽量来自**不同**的音频气质标签
 * （都抽到同一类气质的话，四道听感题就测的是同一件事）
 */
function pickAudio(audioPool, need) {
  const byTag = new Map();
  for (const q of shuffle(audioPool)) {
    const tag = q.audioRef || 'default';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(q);
  }
  const tags = shuffle([...byTag.keys()]);
  const out = [];
  // 先每类拿一道
  for (const tag of tags) {
    if (out.length >= need) break;
    out.push(byTag.get(tag)[0]);
  }
  // 不够再补
  if (out.length < need) {
    const rest = shuffle(audioPool.filter((q) => !out.includes(q)));
    out.push(...rest.slice(0, need - out.length));
  }
  return out;
}

/** 按规则抽一套题 */
export function sampleQuestions(all) {
  const audioPool = [];
  const choicePool = new Map(DIMS.map((d) => [d, []]));
  for (const q of all) {
    if (q.type === 'audio') audioPool.push(q);
    else (choicePool.get(primaryOf(q)) || choicePool.get('melody')).push(q);
  }

  const picked = pickAudio(audioPool, SAMPLE_RULE.audio);
  for (const [dim, need] of Object.entries(SAMPLE_RULE.choiceByDim)) {
    picked.push(...shuffle(choicePool.get(dim) || []).slice(0, need));
  }
  // 最后把顺序打乱：听感题与选择题交错出现，不要"先 4 道听感再来选择题"
  return shuffle(picked);
}

/**
 * 听感题的音频（2026-09-22 新增）
 * ------------------------------------------------------------
 * 老版本的听感题 `audioRef` 是 null → 前端拿到的 audioUrl 是空的，
 * 也就是说"听感题"其实**没有声音**（用户看的截图里那两题就是干问）。
 * 现在 `audioRef` 存的是**音频气质标签**（rhythm / melody / quiet / texture / vocal），
 * 这里按标签从我们自己的曲库里随机挑一首带 30 秒试听的曲目。
 * 不写死某一首歌的原因：曲库/版权会变，写死了哪天就播不出来；
 * 而题干问的都是即时感受（听到鼓点想不想动），换成同气质的另一首不影响效度。
 *
 * ⚠️⚠️ 2026-09-22 第二次踩坑（第一版实现取不到任何音频）：
 *   第一版是"先从 Album 里按流派抽一张，再找它的曲目"，结果**全空**。两个原因：
 *     ① 库里 6246 张专辑，但**只有 2205 条曲目被缓存过** —— 随手抽一张专辑，
 *        大概率它的曲目压根没入库，于是 `Track.findOne` 返回 null；
 *     ② 中文区流派是**繁体中文**（國語流行樂/廣東歌…），英文正则一条都匹配不上。
 *   现在反过来做：**先从"有试听的曲目"里随机抽样**，再用它们对应的专辑流派去挑气质最接近的那条。
 *   两次查询、必然有结果，而且仍然优先匹配气质。
 *
 * ⚠️ 盲听：只回传音频地址，**不告诉用户是哪张专辑哪首歌**（避免"这首歌和我的类型有什么关系"的干扰）。
 */
export async function resolveAudio(audioRef) {
  const pattern = AUDIO_TAG_GENRE[audioRef || ''] || '';

  /**
   * ⚠️⚠️ 2026-09-22 第三次修（用户实测："这道题放的音乐根本没有鼓点，背景是管弦乐纯音乐"）
   * ------------------------------------------------------------
   * 上一版是"从 60 条随机曲目里碰运气看有没有气质命中的" —— 命中率太低，
   * 命中不了就退回"任意一条能播的"，于是**节奏题配上了管弦乐**，题干与音频当场矛盾。
   * 现在改成**定向**：先按气质正则筛出「候选专辑」，再从这些专辑的曲目里抽。
   *   ① 筛专辑：`isEligible: true`（只从合格专辑里取）+ genre 命中气质正则
   *   ② ⚠️ **抽那个流派时按 sqrt(数量) 加权**，否则粤语/国语流行（库里上千张）
   *      会把摇滚/爵士/另类挤没 —— 用户已经报过"专辑池全是粤语区的"。
   *   ③ 命中不到才逐级放宽：去掉 isEligible 限制 → 最后才是任意能播的一条。
   * 这样"题问节奏"就**一定**拿到节奏型的曲子（舞曲/摇滚/Hip-Hop/R&B/放克）。
   */
  const re = new RegExp(pattern, 'i');

  /**
   * ⚠️ 2026-09-22 第四次修（自检实测：气质命中率只有 67%）
   * ------------------------------------------------------------
   * 上一版是"先按气质挑一张专辑，再看它的曲目有没有试听" —— 但库里 6246 张专辑
   * **只有 2000 多张的曲目被缓存过**，随手挑中的专辑很可能一条曲目都没入库，
   * 于是又退回"任意一条能播的" → 气质又丢了（实测 67% 命中）。
   * 现在反过来：**先把"真的有试听曲目的专辑"集合拿出来**（带缓存，5 分钟有效），
   * 只在这个集合里按气质挑 —— 挑中的专辑一定有声音，气质才不会丢。
   */
  let playableIds = null;
  let playableAt = 0;
  async function playableAlbumIds() {
    if (playableIds && Date.now() - playableAt < 5 * 60 * 1000) return playableIds;
    const rows = await Track.distinct('albumId', { previewUrl: { $nin: [null, ''] } });
    playableIds = rows;
    playableAt = Date.now();
    return playableIds;
  }

  /** 在"genre 命中气质 **且真的有试听曲目**"的专辑里随机挑一张（按 sqrt 数量加权） */
  async function pickAlbumByGenre(extraMatch = {}) {
    const ids = await playableAlbumIds();
    if (!ids.length) return null;
    const groups = await Album.aggregate([
      { $match: { _id: { $in: ids }, genre: re, ...extraMatch } },
      { $group: { _id: '$genre', n: { $sum: 1 } } },
    ]);
    if (!groups.length) return null;
    const weights = groups.map((g) => Math.sqrt(g.n));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let chosen = groups[0]._id;
    for (let i = 0; i < groups.length; i += 1) {
      r -= weights[i];
      if (r <= 0) {
        chosen = groups[i]._id;
        break;
      }
    }
    const pool = await Album.aggregate([
      { $match: { _id: { $in: ids }, genre: chosen, ...extraMatch } },
      { $sample: { size: 12 } },
      { $project: { _id: 1 } },
    ]);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)]._id : null;
  }

  async function pickTrack(alIds) {
    if (!alIds || !alIds.length) return null;
    const rows = await Track.aggregate([
      { $match: { albumId: { $in: alIds }, previewUrl: { $nin: [null, ''] } } },
      { $sample: { size: 1 } },
      { $project: { previewUrl: 1 } },
    ]);
    return rows.length ? rows[0].previewUrl : null;
  }

  /**
   * ⚠️ 2026-09-22 D4：人工白名单（最高优先级，先于 genre 定向）
   * ------------------------------------------------------------
   * 先尝试从"人工确认过的知名专辑"里取试听。命中且库里真有试听曲目 → 直接用；
   * 否则整段跳过，退回 ① genre 定向（绝不退化成没声音）。
   * 匹配做了归一化（去空格/标点/大小写），容忍 iTunes 命名差异；
   * 库里没有的（命名不同 / 未入库）→ 自然落空，不影响后续兜底。
   */
  const normMatch = (s) => String(s || '').toLowerCase().replace(/[\s\-_·'’.,&()]/g, '');
  const wl = AUDIO_WHITELIST[audioRef || ''] || [];
  if (wl.length) {
    const ids = await playableAlbumIds();
    if (ids.length) {
      const candidates = await Album.find({ _id: { $in: ids } }, 'name artistName').lean();
      const hit = candidates.filter((a) =>
        wl.some(
          (w) => normMatch(w.album) === normMatch(a.name) && normMatch(w.artist) === normMatch(a.artistName),
        ),
      );
      if (hit.length) {
        const chosen = hit[Math.floor(Math.random() * hit.length)];
        const url = await pickTrack([chosen._id]);
        if (url) return url;
      }
    }
  }

  // ① 首选：合格专辑 + 气质流派
  let albumId = await pickAlbumByGenre({ isEligible: true });
  let url = await pickTrack(albumId ? [albumId] : []);
  if (url) return url;
  // ② 放宽：不限合格标记，但仍要求气质流派
  albumId = await pickAlbumByGenre();
  url = await pickTrack(albumId ? [albumId] : []);
  if (url) return url;
  // ③ 最后兜底：任意一条能播的（**宁可没有鼓点也不能没声音**，但题干已改成不假设具体特征）
  const any = await Track.aggregate([
    { $match: { previewUrl: { $nin: [null, ''] } } },
    { $sample: { size: 1 } },
    { $project: { previewUrl: 1 } },
  ]);
  return any.length ? any[0].previewUrl : null;
}

/** 取一套随机题（含听感题音频地址） */
/**
 * 取一套题
 * @param {string[]} [resumeIds] 续答用：按这些 **题目 id 原样取回** 那一套题
 * ------------------------------------------------------------
 * 为什么必须有这个参数（2026-09-22 用户："我做一半不小心按到刷新或者退出，重进就要重头来"）：
 *   题目是**每次随机抽**的，刷新后抽到的是**另一套** ——
 *   所以"本地存答案"是不够的：必须把"当时抽到的那 20 道题的 id"一起存下来，
 *   重进时按这份 id 列表取回同一套题，答案才能对得上。
 *   （id 无效/数量不在 18~24 区间 → 当作没传，重新随机抽一套，保证不会因为脏数据卡死。）
 */
export async function getQuestions(resumeIds) {
  const all = await PersonalityQuestion.find().sort({ order: 1 });
  if (!all.length) return { list: [], meta: { total: 0, audio: 0 } };

  let picked = null;
  let usedResume = false;
  if (Array.isArray(resumeIds) && resumeIds.length >= SAMPLE_LIMITS.min && resumeIds.length <= SAMPLE_LIMITS.max) {
    const byId = new Map(all.map((q) => [String(q._id), q]));
    const restored = resumeIds.map((id) => byId.get(String(id))).filter(Boolean);
    // 全部命中才认（少一道都说明题库变了，宁可重抽）
    if (restored.length === resumeIds.length) {
      picked = restored;
      usedResume = true;
    }
  }
  if (!picked) picked = sampleQuestions(all);
  const list = [];
  for (const q of picked) {
    const base = {
      questionId: String(q._id),
      order: q.order,
      type: q.type,
      title: q.title,
      primary: primaryOf(q),
      dims: q.dims,
      /**
       * 选项乱序（2026-09-22 用户："我不希望我们这个题目很明显就指向某个人格"）
       * ------------------------------------------------------------
       * 原来选项顺序是写死的：A=旋律 B=节奏 C=音色 D=安静 ——
       * 做过一次的用户就会形成"想当节拍动物就选 B"的经验，测出来的是**记忆**不是偏好。
       * 现在每次请求都把选项打乱，并另给一个展示用的字母 displayKey（A/B/C/D/E）。
       * ⚠️ 提交时仍然回传**原始 key**（`key`），所以计分逻辑完全不用改 ——
       *    乱的只是"给人看的顺序与字母"，不是"机器认的标识"。
       */
      options: shuffle(q.options || []).map((o, i) => ({
        key: o.key,
        displayKey: String.fromCharCode(65 + i),
        label: o.label,
        // 中立出口选项要能被前端识别（渲染成"说不上来"的样式，且不计分）
        neutral: !o.score || Object.keys(o.score).length === 0,
      })),
    };
    if (q.type === 'audio') {
      // eslint-disable-next-line no-await-in-loop
      base.audioUrl = await resolveAudio(q.audioRef);
    }
    list.push(base);
  }

  return {
    list,
    meta: {
      total: list.length,
      audio: list.filter((q) => q.type === 'audio').length,
      poolSize: all.length,
      rule: SAMPLE_RULE,
      limits: SAMPLE_LIMITS,
      // 本次这一套题的 id 列表（前端要存下来，刷新后按它取回同一套题）
      qids: list.map((q) => q.questionId),
      // ⚠️ 只有**真的按 id 取回**才算续答；传了脏 id 而实际重抽时必须为 false，
      //    否则前端会拿旧答案往新题上套（自检抓到的 bug）。
      resumed: usedResume,
    },
  };
}

/**
 * 提交作答
 * ------------------------------------------------------------
 * ⚠️ 2026-09-22：校验口径从"必须答完题库全部题"改成"必须答完**本次这一套**"。
 *   题库已经有 50 道、每次只抽 20 道，再按"全部题"校验就永远提交不了。
 *   新口径：题号不能重复、每道 id 都得在库里、数量落在允许区间。
 */
export async function submit(userId, answers) {
  const all = await PersonalityQuestion.find();
  if (!all.length) throw new BadRequestError('题库为空，请先由后台导入题目');

  const byId = new Map(all.map((q) => [String(q._id), q]));
  const seen = new Set();
  const used = [];
  for (const a of answers) {
    const id = String(a.questionId);
    if (seen.has(id)) throw new BadRequestError('同一道题不能重复提交');
    const q = byId.get(id);
    if (!q) throw new BadRequestError('提交里包含题库中不存在的题目，请重新开始测评');
    seen.add(id);
    used.push(q);
  }

  const n = used.length;
  if (n < SAMPLE_LIMITS.min || n > SAMPLE_LIMITS.max) {
    throw new BadRequestError(
      `本次需要作答 ${SAMPLE_LIMITS.min}~${SAMPLE_LIMITS.max} 道题，收到 ${n} 道`,
    );
  }

  const types = await PersonalityType.find();
  if (!types.length) throw new BadRequestError('人格类型库为空，请先由后台导入类型');

  const raw = computeScores(used, answers);
  const ceilings = maxByDim(used);
  const norm = normalizeScores(raw, ceilings);
  const weights = dimWeights(types);
  const matchedInfo = matchType(norm, types, weights);
  const matched = matchedInfo.type;
  const display = toDisplayDims(norm);

  // AI 解读：用归一化后的 6 维（比原始分更能说明"你在哪一维突出"）；失败静默降级
  let aiComment = await generateComment({
    typeName: matched.name,
    description: matched.description,
    scores: norm,
    nickname: null,
  });
  let source = 'llm';
  if (!aiComment) {
    aiComment = buildTemplateComment({
      typeName: matched.name,
      description: matched.description,
      scores: norm,
    });
    source = 'template';
  }

  const result = await PersonalityResult.create({
    userId,
    typeCode: matched.code,
    answers: answers.map((a) => ({ questionId: a.questionId, optionKey: a.optionKey })),
    // ⚠️ scores 用 Mixed 存三段：_display 给前端画人格卡那 4 根条（前端零改动），
    //    _raw/_norm 留给后台分析与复核。旧记录里 scores 直接就是 4 维，getResult 会兼容。
    scores: {
      _display: display,
      _norm: norm,
      _raw: raw,
      _ceilings: ceilings,
      _similarity: matchedInfo.similarity,
      _ranking: matchedInfo.ranking,
      _questionCount: n,
    },
    aiComment,
    aiCommentSource: source,
    recommendAlbums: matched.recommendAlbumIds || [],
  });

  return result;
}

export async function getResult(resultId, userId) {
  const result = await PersonalityResult.findById(resultId);
  if (!result) throw new NotFoundError('测评结果');
  if (String(result.userId) !== String(userId)) throw new NotFoundError('测评结果');
  const type = await PersonalityType.findOne({ code: result.typeCode });
  const albums = await Album.find({ _id: { $in: result.recommendAlbums || [] } });

  /**
   * ⚠️ scores 有两代格式：
   *   旧记录：{ melody, rhythm, arrangement, calm }（4 维，直接就是展示值）
   *   新记录：{ _display, _norm, _raw, ... }（6 维计分，_display 是折算好的 4 维）
   * 前端只认"4 个键 → 画 4 根条"，所以这里统一输出 _display（旧记录原样返回）。
   * 这样前端与人格卡样式**完全不用动**。
   */
  const rawScores = result.scores || {};
  const displayScores = rawScores._display || rawScores;

  return {
    resultId: String(result._id),
    userId: String(result.userId),
    typeCode: result.typeCode,
    typeName: type?.name || result.typeCode,
    typeDescription: type?.description || '',
    scores: displayScores,
    /** 6 维明细（原始分 / 归一化 / 匹配相似度 / 本次题量）—— 后台与复核用，前端不渲染 */
    detail: rawScores._norm
      ? {
          norm: rawScores._norm,
          raw: rawScores._raw,
          similarity: rawScores._similarity,
          ranking: rawScores._ranking,
          questionCount: rawScores._questionCount,
        }
      : null,
    aiComment: result.aiComment,
    aiCommentSource: result.aiCommentSource,
    answers: result.answers.map((a) => ({ questionId: String(a.questionId), optionKey: a.optionKey })),
    recommendAlbums: albums.map(musicService.serializeAlbum),
    createdAt: result.createdAt,
  };
}

export async function listMyResults(userId, query) {
  const { page, pageSize, skip, limit } = parsePagination(query);
  const filter = { userId };
  const [list, total] = await Promise.all([
    PersonalityResult.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PersonalityResult.countDocuments(filter),
  ]);
  return {
    list: list.map((r) => ({
      resultId: String(r._id),
      typeCode: r.typeCode,
      aiCommentSource: r.aiCommentSource,
      createdAt: r.createdAt,
    })),
    page,
    pageSize,
    total,
  };
}

export async function listTypes() {
  const types = await PersonalityType.find().sort({ code: 1 });
  return types.map((t) => ({
    code: t.code,
    name: t.name,
    description: t.description,
    dims: t.dims,
  }));
}

export async function getTypeByCode(code) {
  const type = await PersonalityType.findOne({ code });
  if (!type) throw new NotFoundError('人格类型');
  const albums = await Album.find({ _id: { $in: type.recommendAlbumIds || [] } });
  return {
    code: type.code,
    name: type.name,
    description: type.description,
    dims: type.dims,
    recommendAlbums: albums.map(musicService.serializeAlbum),
  };
}

/** 类型占比统计（图鉴） */
export async function stats() {
  const rows = await PersonalityResult.aggregate([
    { $group: { _id: '$typeCode', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return {
    total,
    list: rows.map((r) => ({
      typeCode: r._id,
      count: r.count,
      ratio: total ? Number((r.count / total).toFixed(4)) : 0,
    })),
  };
}

/* ============================================================
 * 专辑归类投票（众包给「人格推荐池」喂数据）
 * ------------------------------------------------------------
 * 玩法：用户看一张专辑 → 判断"它更像哪一型" → 沉淀为真实用户数据；
 *      后台按票数采纳进推荐池。这样推荐专辑就不是纯拍脑袋，而是有人投过票的。
 * ============================================================ */

/** 6 型选项（投票界面用） */
async function tagTypeOptions() {
  const types = await PersonalityType.find().sort({ code: 1 }).select('code name description').lean();
  return types.map((t) => ({ code: t.code, name: t.name, description: t.description }));
}

/**
 * 下一张待投票的专辑。
 * 策略：先排除用户已投过的 → 随机抽 40 张 → 按**已有票数升序**取最少的那张。
 * 这样既保证多样性（随机），又不会一直推那几张热门专辑（票少先上）。
 */
export async function nextTagAlbum(userId) {
  const types = await tagTypeOptions();
  const voted = await AlbumTagVote.find({ userId }).select('albumId').lean();
  const votedIds = voted.map((v) => v.albumId);
  /**
   * ⚠️ 2026-09-22 用户："为什么目前感觉这里的专辑池全是粤语区的？推荐必须多样化，什么种类地区都要有"
   * ------------------------------------------------------------
   * 真因：池子里 `isEligible` 的专辑本来就偏向粤语/国语（按流派取榜单时 hk 区占一半），
   * 而原来只是 `$sample 40` 全池均匀抽 → 抽到粤语的概率就是它在库里的占比（很高）。
   * 现在改成**分层抽样**：
   *   ① 先列出池子里有哪些流派（distinct，很轻）；
   *   ② 按 **sqrt(该流派数量)** 加权随机选一个流派 —— 大流派仍更常出现，但不会被它吃掉；
   *   ③ 再在这个流派里抽一张**还没投过**的。
   * 效果：爵士/摇滚/另类/日韩这些小流派也能稳定出现在投票池里。
   */
  const genres = (await Album.distinct('genre', { isEligible: true })).filter(Boolean);
  let pool = [];
  if (genres.length) {
    const counts = await Album.aggregate([
      { $match: { isEligible: true, _id: { $nin: votedIds } } },
      { $group: { _id: '$genre', n: { $sum: 1 } } },
    ]);
    const usable = counts.filter((c) => c.n > 0);
    if (usable.length) {
      const weights = usable.map((c) => Math.sqrt(c.n));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let chosen = usable[0]._id;
      for (let i = 0; i < usable.length; i += 1) {
        r -= weights[i];
        if (r <= 0) {
          chosen = usable[i]._id;
          break;
        }
      }
      pool = await Album.aggregate([
        { $match: { isEligible: true, genre: chosen, _id: { $nin: votedIds } } },
        { $sample: { size: 20 } },
      ]);
    }
  }
  // 兜底：分层没抽到（比如全投过了）就退回原来的全池抽样
  if (!pool.length) {
    pool = await Album.aggregate([
      { $match: { isEligible: true, _id: { $nin: votedIds } } },
      { $sample: { size: 40 } },
    ]);
  }
  if (!pool.length) return { album: null, types, votedCount: votedIds.length, allDone: true };

  const counts = await AlbumTagVote.aggregate([
    { $match: { albumId: { $in: pool.map((p) => p._id) } } },
    { $group: { _id: '$albumId', n: { $sum: 1 } } },
  ]);
  const nById = new Map(counts.map((c) => [String(c._id), c.n]));
  pool.sort((a, b) => (nById.get(String(a._id)) || 0) - (nById.get(String(b._id)) || 0));

  return {
    album: musicService.serializeAlbum(pool[0]),
    types,
    votedCount: votedIds.length,
    allDone: false,
  };
}

/** 投一票（同一用户对同一张专辑只留最新一票） */
export async function voteAlbumTag(userId, albumId, typeCode) {
  const album = await Album.findById(albumId).select('_id').lean();
  if (!album) throw new NotFoundError('专辑');
  const type = await PersonalityType.findOne({ code: typeCode }).select('code').lean();
  if (!type) throw new BadRequestError('人格类型不存在');
  await AlbumTagVote.findOneAndUpdate(
    { userId, albumId },
    { $set: { typeCode } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  const votedCount = await AlbumTagVote.countDocuments({ userId });
  return { votedCount };
}

/** 聚合统计：每型票数最高的若干张（后台"采纳进推荐池"用） */
export async function albumTagStats(limit = 8) {
  const rows = await AlbumTagVote.aggregate([
    { $group: { _id: { albumId: '$albumId', typeCode: '$typeCode' }, votes: { $sum: 1 } } },
    { $sort: { votes: -1 } },
  ]);
  const albumIds = [...new Set(rows.map((r) => r._id.albumId))];
  const albums = albumIds.length ? await Album.find({ _id: { $in: albumIds } }).select('name artistName artworkUrl').lean() : [];
  const byId = new Map(albums.map((a) => [String(a._id), a]));
  const byType = {};
  for (const r of rows) {
    const code = r._id.typeCode;
    if (!byType[code]) byType[code] = [];
    if (byType[code].length >= limit) continue;
    const a = byId.get(String(r._id.albumId));
    if (!a) continue;
    byType[code].push({
      id: String(a._id),
      name: a.name,
      artistName: a.artistName,
      artworkUrl: a.artworkUrl,
      votes: r.votes,
    });
  }
  const total = await AlbumTagVote.estimatedDocumentCount();
  const voters = await AlbumTagVote.distinct('userId');
  return { total, voters: voters.length, byType };
}

export default {
  getQuestions,
  submit,
  getResult,
  listMyResults,
  listTypes,
  getTypeByCode,
  stats,
  nextTagAlbum,
  voteAlbumTag,
  albumTagStats,
};
