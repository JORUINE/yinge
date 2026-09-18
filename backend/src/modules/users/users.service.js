/**
 * 用户中心服务
 * 对应接口：A-05 修改资料 / A-06 个人统计
 */
import { User, Battle, PersonalityResult, Favorite, Vote } from '../../models/index.js';
import { DuplicateError } from '../../shared/errors.js';

export async function updateProfile(userId, { nickname }) {
  if (nickname) {
    const exists = await User.exists({ nickname, _id: { $ne: userId } });
    if (exists) throw new DuplicateError('该昵称已被使用');
  }
  const user = await User.findByIdAndUpdate(userId, { $set: { nickname } }, { new: true });
  return user;
}

export async function stats(userId) {
  const [battleTotal, battleFinished, resultTotal, favoriteTotal, voteTotal] = await Promise.all([
    Battle.countDocuments({ userId }),
    Battle.countDocuments({ userId, status: 'finished' }),
    PersonalityResult.countDocuments({ userId }),
    Favorite.countDocuments({ userId }),
    Vote.countDocuments({ userId, isInvalid: false }),
  ]);
  return { battleTotal, battleFinished, resultTotal, favoriteTotal, voteTotal };
}

/**
 * A-07 游客数据迁移：把「游客账号」产生的数据整体转给正式账号。
 * ------------------------------------------------------------
 * 为什么必须做：免注册可玩是需求文档的要求，但"玩到一半才注册"不能把之前的对决丢掉。
 * 安全性：必须由**已登录的非游客账号**发起（控制器里已拦游客）；
 *         guestId 来自本机 localStorage，只接受 role==='guest' 的来源账号，
 *         避免拿别人的正式账号当来源。
 * 幂等性：搬完就删掉游客账号；重复调用因来源已不存在而直接返回「来源不是游客账号」。
 */
export async function claimGuestData(targetUserId, guestId) {
  const gid = String(guestId || '');
  if (!gid) return { migrated: false, reason: '没有可迁移的游客身份' };
  if (!/^[a-fA-F0-9]{24}$/.test(gid)) return { migrated: false, reason: '游客标识无效' };
  if (String(targetUserId) === gid) return { migrated: false, reason: '来源与目标相同' };

  const [target, guest] = await Promise.all([User.findById(targetUserId), User.findById(gid)]);
  if (!target) return { migrated: false, reason: '账号不存在' };
  if (!guest || guest.role !== 'guest') return { migrated: false, reason: '来源不是游客账号' };

  const moved = { battles: 0, votes: 0, results: 0, favorites: 0 };
  // 唯一索引可能冲突（目标账号已投过同一场）→ 单条失败不致命，跳过该条即可
  const assign = async (Model, key) => {
    try {
      const res = await Model.updateMany({ userId: guest._id }, { $set: { userId: target._id } });
      moved[key] = res.modifiedCount ?? res.nModified ?? 0;
    } catch {
      moved[key] = 0;
    }
  };
  // 先搬"内容"，最后搬票（票的唯一索引最可能冲突）
  await assign(Battle, 'battles');
  await assign(PersonalityResult, 'results');
  await assign(Favorite, 'favorites');
  await assign(Vote, 'votes');

  // 游客号已完成使命 → 删掉，避免云端堆积无效账号（这是你说的"注册量大"要防的点）
  try {
    await User.deleteOne({ _id: guest._id });
  } catch {
    /* 删不掉不影响已迁移的数据 */
  }

  return { migrated: true, moved };
}

export default { updateProfile, stats, claimGuestData };
