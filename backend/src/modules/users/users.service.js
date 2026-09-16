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

export default { updateProfile, stats };
