/**
 * 对决路由（全部需要登录）
 *   POST   /api/battles                        创建对决            B-01
 *   GET    /api/battles/:id                    对决详情            B-02
 *   GET    /api/battles/:id/next-match         下一场              B-03
 *   POST   /api/battles/:id/matches/:matchId/vote  投票            B-04（淘汰赛）
 *   GET    /api/battles/:id/next-step         下一步（小组/复活/淘汰赛/结束）
 *   POST   /api/battles/:id/groups/:groupId/vote  小组/复活多选投票  B-04（新赛制）
 *   POST   /api/battles/:id/revival            开启复活赛          B-05（旧赛制）
 *   GET    /api/battles/:id/result             结果与夺冠路径      B-06
 *   GET    /api/battles                        我的对决列表        B-07
 *   DELETE /api/battles/:id                    删除对决            B-08
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/http.js';
import { SCOPE_TYPES } from '../../models/index.js';
import * as controller from './battles.controller.js';

const artistEntry = z.object({
  artistId: z.coerce.number().int().positive(),
  albumCount: z.coerce.number().int().min(1).max(50).optional(),
  // 多歌手模式下每位歌手可各自自选专辑
  albumIds: z.array(z.coerce.number().int().positive()).max(100, '单场对决最多 100 张专辑').optional(),
});

const createSchema = z
  .object({
    scopeType: z.enum(SCOPE_TYPES),
    scopeKey: z.string().trim().max(120).optional(),
    // 单歌手模式：artistId 必填，albumCount 可选（限制参赛张数，与服务 resolvePool 共用）
    artistId: z.coerce.number().int().positive().optional(),
    albumCount: z.coerce.number().int().min(1).max(50).optional(),
    artists: z.array(artistEntry).min(2).max(6).optional(),
    alignCount: z.coerce.number().int().min(1).max(24).optional(),
    // 对位配对方式：同序号（默认）/ 年代就近
    alignMode: z.enum(['ordinal', 'chrono']).optional(),
    // 指定对决：逐行指定的对位组，每组 2 张专辑的外部数字标识，最少 1 组
    pairs: z.array(z.array(z.coerce.number().int().positive()).length(2)).min(1).max(50).optional(),
    genre: z.string().trim().max(40).optional(),
    startYear: z.coerce.number().int().min(1900).max(2100).optional(),
    endYear: z.coerce.number().int().min(1900).max(2100).optional(),
    albumIds: z.array(z.coerce.number().int().positive()).max(100, '单场对决最多 100 张专辑').optional(),
    /**
     * 地区/语种筛选（2026-09-23 用户拍板，两級）：
     *   zone = 'zh'（华语区）| 'foreign'（外语区）；都不传 = 混着打（与改动前行为一致）
     *   lang = 'mandarin' | 'cantonese' | 'japanese' | 'korean' | 'western' —— 在 zone 之下再细分
     */
    zone: z.enum(['zh', 'foreign']).optional(),
    lang: z.enum(['mandarin', 'cantonese', 'japanese', 'korean', 'western']).optional(),
    withRevival: z.boolean().optional(),
    // 新赛制开关：2 = 规模自选 + 小组赛 4 选 2 + 遗珠复活 + 1v1 淘汰；默认 1（旧赛制）
    tournamentVersion: z.coerce.number().int().min(1).max(2).optional(),
    // 抽张策略：random=随机抽（默认，保留盲盒刺激）/ newest=最新 N 张 / picked=用户自选（配合 albumIds）
    pick: z.enum(['newest', 'random', 'picked']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.scopeType === 'artist' && !data.artistId) {
      ctx.addIssue({ code: 'custom', path: ['artistId'], message: '单歌手模式必须提供 artistId' });
    }
    if (['multi-artist', 'aligned'].includes(data.scopeType) && (!data.artists || data.artists.length < 2)) {
      ctx.addIssue({ code: 'custom', path: ['artists'], message: '该模式需要 2 位及以上歌手' });
    }
    if (data.scopeType === 'aligned') {
      if (!data.alignCount) ctx.addIssue({ code: 'custom', path: ['alignCount'], message: '对位赛必须提供对位张数' });
      if (data.artists && data.artists.length > 4) {
        ctx.addIssue({ code: 'custom', path: ['artists'], message: '对位赛歌手数限定 2 至 4 位' });
      }
    }
    if (data.scopeType === 'duel' && (!data.pairs || data.pairs.length < 1)) {
      ctx.addIssue({ code: 'custom', path: ['pairs'], message: '指定对决至少需要 1 组对位（每组 2 张专辑）' });
    }
    if (data.scopeType === 'custom' && (!data.albumIds || data.albumIds.length < 4)) {
      ctx.addIssue({ code: 'custom', path: ['albumIds'], message: '手动挑选模式至少 4 张专辑' });
    }
    if (data.scopeType === 'genre' && !data.genre) {
      ctx.addIssue({ code: 'custom', path: ['genre'], message: '请提供流派' });
    }
  });

const idParam = z.object({ id: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的标识') });
const voteParam = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的对决标识'),
  matchId: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的场次标识'),
});
const groupVoteParam = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的对决标识'),
  groupId: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的分组标识'),
});
const voteBody = z.object({
  // 按接口文档 5.4：传「外部专辑标识」，数字或数字字符串均可
  albumId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/, '专辑标识必须为数字')]),
});
const groupVoteBody = z.object({
  // 多选晋级：传「外部专辑标识」数组，长度需等于该分组 advanceCount
  // ⚠️ 上限不能写死成 4：小组赛每组固定选 2 张，但**遗珠复活**要一次捞回
  //    knockoutSize − qualified 张，最多可到 7 张（如 17/18 张参赛时）。
  //    真正的"必须正好选 advanceCount 张"由 service 里校验，这里只给一个宽松上界。
  pickedAlbumIds: z
    .array(z.union([z.number().int().positive(), z.string().regex(/^\d+$/, '专辑标识必须为数字')]))
    .min(1)
    .max(16),
});
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['playing', 'finished']).optional(),
});

// 好友一起玩：邀请码路径必须挂在 /:id 之前，否则会被当成 ObjectId 解析失败
const codeParam = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(12)
    .regex(/^[A-Za-z0-9]+$/, '邀请码格式不正确'),
});
const inviteParam = z.object({ id: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的标识') });

const router = Router();
router.use(authenticate);

// ---- 同款签表（好友一起玩）----
router.get('/join/:code', validate(codeParam, 'params'), asyncHandler(controller.getInvite));
router.post('/join/:code', validate(codeParam, 'params'), asyncHandler(controller.joinInvite));
router.get(
  '/join/:code/compare',
  validate(codeParam, 'params'),
  asyncHandler(controller.getInviteCompare),
);
router.post(
  '/:id/invite',
  validate(inviteParam, 'params'),
  asyncHandler(controller.createInvite),
);

router.get('/', validate(listQuery, 'query'), asyncHandler(controller.listMine));
router.post('/', validate(createSchema, 'body'), asyncHandler(controller.create));
router.get('/:id', validate(idParam, 'params'), asyncHandler(controller.detail));
router.get('/:id/next-match', validate(idParam, 'params'), asyncHandler(controller.nextMatch));
router.post(
  '/:id/matches/:matchId/vote',
  validate(voteParam, 'params'),
  validate(voteBody, 'body'),
  asyncHandler(controller.vote),
);
// 新赛制（tournamentVersion=2）：统一"下一步"入口，返回小组 / 复活 / 淘汰赛 / 已结束
router.get('/:id/next-step', validate(idParam, 'params'), asyncHandler(controller.nextStep));
// 新赛制：小组赛 / 遗珠复活的一次多选投票
router.post(
  '/:id/groups/:groupId/vote',
  validate(groupVoteParam, 'params'),
  validate(groupVoteBody, 'body'),
  asyncHandler(controller.groupVote),
);
router.post('/:id/revival', validate(idParam, 'params'), asyncHandler(controller.revival));
// 撤销上一步（用户："选错了没关系，可以回退"）
router.post('/:id/undo', validate(idParam, 'params'), asyncHandler(controller.undo));
router.get('/:id/result', validate(idParam, 'params'), asyncHandler(controller.result));
router.delete('/:id', validate(idParam, 'params'), asyncHandler(controller.remove));

export default router;
