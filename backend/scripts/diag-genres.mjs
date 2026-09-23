/**
 * 流派解析体检（2026-09-23）
 * ------------------------------------------------------------
 * 起因：用户报「韩国流行乐」出来一堆欧美流行歌手。
 * 预期根因：界面传的是**中文流派名**（库里歌手的 iTunes 标签），
 *   而 GENRE_ALIAS / GENRE_RSS 只登记了英文键（k-pop / kpop），
 *   于是「韩国流行乐」走不到 K-Pop 档，模糊匹配时被更短的「流行乐」抢走 → 拿 Pop 去搜。
 * 本脚本把库里**真实存在的流派名**逐个跑一遍解析，看清每个落到哪一档。
 * 只读。
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { Artist } from '../src/models/index.js';
import { resolveGenreConf, resolveGenreRss, normalizeGenre } from '../src/modules/music/genreExpand.js';

async function main() {
  await connectDb();
  const rows = await Artist.aggregate([
    { $match: { genre: { $type: 'string' } } },
    { $group: { _id: '$genre', artists: { $sum: 1 } } },
    { $sort: { artists: -1 } },
  ]);
  console.log(`\n===== 库里有流派标签的 ${rows.length} 种，逐个解析 =====`);
  for (const r of rows) {
    const conf = resolveGenreConf(r._id);
    const rss = resolveGenreRss(r._id);
    console.log(
      `${String(r.artists).padStart(4)} 位 | 「${r._id}」(key=${normalizeGenre(r._id)})\n` +
        `        → terms=${JSON.stringify(conf.terms)}  accept=${JSON.stringify(conf.accept)}\n` +
        `        → 榜单源：${rss ? `genreId=${rss.id} countries=${rss.countries.join('/')}` : '❌ 无（退回关键词搜索）'}`,
    );
  }
  await disconnectDb();
}

main().catch(async (e) => {
  console.error('失败：', e);
  try {
    await disconnectDb();
  } catch {}
  process.exit(1);
});
