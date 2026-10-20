/**
 * 开发 / 测试专用路由
 * ------------------------------------------------------------
 * ⚠️⚠️ 2026-10-20 第五十四批：为什么要有这个文件
 *   端到端探针每次都要「起 mongod + 起后端 + 起前端 + 造一局」，
 *   而"造一局"要走完整赛制（8 强 = 7 场投票，每场还有 300~400ms 节流）
 *   ⇒ 连续两次端到端探针被 SIGTERM 掐断（第五十二批如实记录过）。
 *   本质问题：**验证一件已存在的行为，却要重跑一遍业务主流程**。
 *
 *   正解：加一个**只在非 production 注册**的 dev 接口，直接落一局"已结束"的对决，
 *   探针从"7 场投票 + 节流等待"降到"1 次请求"。
 *
 *   ⚠️ 安全边界（三条都不许破）：
 *     ① 只在 `config.env !== 'production'` 注册（见 app.js）
 *     ② 仍要 `authenticate` —— 造出来的局属于调用者本人，与正常业务同一套归属校验
 *     ③ 只写 Battle / BattleMatch 两个集合，不碰 User / Vote / Rank，不污染排行榜
 */
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/http.js';
import { Album, Battle, BattleMatch } from '../../models/index.js';

const router = Router();

/**
 * POST /api/dev/battle
 * ------------------------------------------------------------
 * 造一局已结束的杯赛对决，返回 battleId。
 * body（都可选）：
 *   { albumCount?: number }  参赛张数，默认 8；只接受 2 的幂（4 / 8 / 16），其余回落 8
 *   { scopeType?: string }   默认 'artist'
 *
 * 签名表：4 张 = 2 场 + 1 场决赛；8 张 = 4 + 2 + 1；16 张 = 8 + 4 + 2 + 1。
 * 冠军固定取第 1 张专辑，它的 path 就是真实打过的那几场（含轮空）。
 */
router.post(
  '/battle',
  authenticate,
  asyncHandler(async (req, res) => {
    const asked = Number(req.body?.albumCount) || 8;
    const pool = [4, 8, 16].includes(asked) ? asked : 8;

    // 取真专辑（要 artworkUrl 真实的 —— 分享卡靠它取色与做模糊底）
    const albums = await Album.find({ artworkUrl: { $regex: '^https?://' } })
      .sort({ _id: 1 })
      .limit(pool)
      .lean();
    if (albums.length < pool) {
      return res.status(400).json({
        code: 4001,
        message: `库里的专辑不足以造 ${pool} 张的对局（只有 ${albums.length} 张）`,
      });
    }

    const albumIds = albums.map((a) => a._id);
    const championId = albumIds[0];
    const artists = [...new Set(albums.map((a) => a.artistName).filter(Boolean))].map((name) => ({
      // artistId 只用于展示，这里没有歌手外部 id，给个稳定的占位（不参与任何查询）
      artistId: 0,
      name,
      albumCount: albums.filter((a) => a.artistName === name).length,
    }));

    const battle = await Battle.create({
      userId: req.user._id,
      scopeType: req.body?.scopeType || 'artist',
      scopeKey: 'dev-fixture',
      artists,
      withRevival: false,
      status: 'finished',
      groupCount: 0,
      roundCount: Math.log2(pool),
      currentRound: Math.log2(pool),
      matchTotal: pool - 1,
      hasBye: false,
      tournamentVersion: 2,
      poolTarget: pool,
      knockoutSize: pool / 2,
      revivalNeed: 0,
      stepTotal: pool - 1,
      albumIds,
      championAlbumId: championId,
    });

    // ── 造签表 ──
    // ⚠️⚠️ 2026-10-20 排障记录（写在这里免得再犯）：
    //   第一版把"配成一对"写成 `for (i += 2) stage.push([w[i], w[i+1]])`，
    //   当胜者数是**奇数**（1）时永远产出长度为 1 的 stage ⇒ while 永不退出
    //   ⇒ 同步死循环 + 每轮 matches.push ⇒ 内存 25 秒内爆 4GB，后端 OOM。
    //   而且爆点看起来像"Battle.create 里炸的"（我第一步日志正好打在那之前），
    //   差点误判成 mongoose 的锅。**教训：日志要打在"下一行代码之前"。**
    // 现在的写法：stage 元素是 [a, b|null]，b 为 null 即轮空；
    //             循环条件 `stage.length > 1`，天然收敛；再加一道 200 场上限兜底。
    const roundNames = ['qf', 'semi', 'final', 'final'];
    const totalRounds = Math.log2(pool);
    let stage = [];
    for (let i = 0; i < albumIds.length; i += 2) {
      stage.push([albumIds[i], albumIds[i + 1] ?? null]);
    }

    const matches = [];
    let order = 0;
    let roundIndex = 1;
    let rNameIdx = Math.max(0, totalRounds - 3); // 8 → 0(qf) / 4 → 1(semi)

    // ⚠️ 收尾判定必须是"这一轮打完只剩 1 个胜者"（= 冠军产生），
    //    不能只看 stage.length —— 否则最后一场决赛永远造不出来（第一版就是这个 bug）。
    while (stage.length > 0) {
      const roundName = roundNames[rNameIdx] || 'final';
      const winners = [];
      for (const [l, r] of stage) {
        if (!r) {
          // 轮空：无对手、无比分，直接晋级
          matches.push({
            battleId: battle._id, roundIndex, roundName, matchOrder: order++,
            leftAlbumId: l, rightAlbumId: null, leftVotes: 0, rightVotes: 0,
            winnerAlbumId: l, isBye: true, isRevival: false,
          });
          winners.push(l);
          continue;
        }
        // 冠军永远赢，其余让下标小者赢（确定性，方便复现）
        const winner = l === championId ? l : r;
        matches.push({
          battleId: battle._id, roundIndex, roundName, matchOrder: order++,
          leftAlbumId: l, rightAlbumId: r,
          leftVotes: l === winner ? 3 : 1, rightVotes: r === winner ? 1 : 3,
          winnerAlbumId: winner, isBye: false, isRevival: false,
        });
        winners.push(winner);
      }
      if (matches.length > 200) throw new Error('签表生成异常终止（上限 200 场）');

      if (winners.length <= 1) break; // 冠军已产生
      stage = [];
      for (let i = 0; i < winners.length; i += 2) {
        stage.push([winners[i], winners[i + 1] ?? null]);
      }
      roundIndex += 1;
      rNameIdx += 1;
    }
    await BattleMatch.insertMany(matches);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        battleId: String(battle._id),
        matchTotal: battle.matchTotal,
        matchesCreated: matches.length,
        poolTarget: pool,
        champion: albums[0].name,
      },
    });
  }),
);

export default router;
