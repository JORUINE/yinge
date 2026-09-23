/**
 * 白名单歌手**预灌进曲库**（2026-09-23 用户点名要做）
 * ============================================================
 * 用户原话："这个更是一个没有 白名单里的呢？我以为你把每个流派白名单的歌手都已经放进去了
 *           我就是这么想的，你白名单里那些歌手就很好啊就应该直接内置 **你根本没做**"。
 * 之前的实现只做了"点按钮才去 iTunes 搜"（按时发现），曲库里仍然只有原有的人 ——
 * 所以流派 chip 上显示的还是 5 位 / 10 位，点开也搜不出白名单那批人。
 *
 * 本脚本做的事：把白名单里的名字 → iTunes 搜一次拿 artistId → syncArtist 落库
 * （走完整准入过滤）。已入库的跳过，**幂等**，可以反复跑。
 *
 * 用法：
 *   node scripts/seed-whitelist-artists.mjs                 # 全部白名单，实际写入
 *   node scripts/seed-whitelist-artists.mjs --dry           # 只报"将写入多少位"，不写库
 *   node scripts/seed-whitelist-artists.mjs --genre=流行樂   # 只灌某个流派（含并进来的附加册）
 *   node scripts/seed-whitelist-artists.mjs --limit=60       # 最多处理多少位（防一次太久被限流）
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { Artist } from '../src/models/index.js';
import { GENRE_WHITELIST, EXTRA_LISTS, sameArtistName, whitelistNamesFor } from '../src/data/genreWhitelist.js';
import { normalizeGenre } from '../src/modules/music/genreExpand.js';
import * as itunes from '../src/modules/music/itunes.client.js';
import * as musicService from '../src/modules/music/music.service.js';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const genreArg = argv.find((a) => a.startsWith('--genre='))?.slice(8);
const limit = Number(argv.find((a) => a.startsWith('--limit='))?.slice(8)) || 0;

/** 取要灌的名字清单：默认全部册子；给了 --genre 就只取该流派这一册 */
function targetNames() {
  if (genreArg) {
    const list = whitelistNamesFor(genreArg, normalizeGenre);
    console.log(`范围：流派「${genreArg}」→ ${list.length} 位`);
    return list;
  }
  const all = [...Object.values(GENRE_WHITELIST), ...Object.values(EXTRA_LISTS)].flat();
  const uniq = [...new Set(all)];
  console.log(`范围：全部白名单 → ${uniq.length} 位（去重后）`);
  return uniq;
}

async function main() {
  await connectDb();
  const names = targetNames();
  const capped = limit ? names.slice(0, limit) : names;

  // 一次扫描库里已有的歌手，跳过已入库的（宽松名字匹配，与 whitelistOfGenre 同一口径）
  const existing = await Artist.find({}).select('artistId name albumCount').lean();
  const todo = capped.filter((n) => !existing.some((a) => sameArtistName(a.name, n)));
  console.log(`库里现有歌手 ${existing.length} 位；本次待灌 ${todo.length} 位（已入库的跳过）`);
  if (DRY) {
    console.log(`\n[dry] 将尝试灌入：${todo.slice(0, 30).join('、')}${todo.length > 30 ? ' …' : ''}\n`);
    await disconnectDb();
    return;
  }

  let ok = 0;
  let failed = 0;
  const failures = [];
  const queue = [...todo];
  /**
   * ⚠️ 第一次跑用并发 3 → **241 位被 iTunes 限流**（HTTP 403 / 429，大批量不是小批量）。
   * 所以并发与间隔都做成可调，默认更保守：并发 2 + 每次请求前 350ms 间隔。
   * 脚本幂等，被限流的下次重跑就能补上。
   */
  const CONC = Number(argv.find((a) => a.startsWith('--conc='))?.slice(7)) || 2;
  const DELAY = Number(argv.find((a) => a.startsWith('--delay='))?.slice(8)) || 350;
  const worker = async () => {
    while (queue.length) {
      const name = queue.shift();
      if (DELAY) await new Promise((r) => setTimeout(r, DELAY));
      try {
        // ① 搜一次拿 artistId（取第一条名叫得像的）
        // eslint-disable-next-line no-await-in-loop
        const { artists } = await itunes.searchArtists(name, 5);
        const hit = (artists || []).find((a) => sameArtistName(a.name, name)) || (artists || [])[0];
        if (!hit) {
          failed += 1;
          failures.push(`${name}（搜不到）`);
          continue;
        }
        // ② 同步整张碟（含准入过滤）
        // eslint-disable-next-line no-await-in-loop
        await musicService.syncArtist(hit.artistId);
        ok += 1;
        if (ok % 10 === 0) console.log(`  …已灌 ${ok} 位（最近：${name}）`);
      } catch (e) {
        failed += 1;
        failures.push(`${name}（${e?.message || '同步失败'}）`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, () => worker()));

  const after = await Artist.countDocuments();
  console.log(`\n===== 预灌完成 =====`);
  console.log(`成功 ${ok} 位 · 失败 ${failed} 位 · 库内歌手总数 ${existing.length} → ${after}`);
  if (failures.length) {
    console.log(`失败清单（前 20）：\n  ${failures.slice(0, 20).join('\n  ')}`);
    console.log('（失败多为 iTunes 搜不到该写法 / 偶发限流；改天重跑即会补上，脚本幂等）');
  }
  await disconnectDb();
}

main().catch(async (e) => {
  console.error('预灌失败：', e);
  try {
    await disconnectDb();
  } catch {}
  process.exit(1);
});
