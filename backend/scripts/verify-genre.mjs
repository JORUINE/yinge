/**
 * 流派扩库验证（可反复跑）
 * ------------------------------------------------------------
 * 断言：① 摇滚/嘻哈这类流派必须能带出**真正的流派大咖**（不再只有小众与噪声）
 *       ② 必须同时出现华语与欧美歌手（两区穿插生效）
 *       ③ 歌单伪歌手 / 制作人噪声被剔除
 *       ④ 华语系流派仍走关键词源、能正常出人
 * 用法：node scripts/verify-genre.mjs
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { discoverGenreArtists, looksLikeCuratedArtist, GENRE_RSS } from '../src/modules/music/genreExpand.js';

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  [OK] ${name}${extra ? '  ' + extra : ''}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${name}${extra ? '  ' + extra : ''}`);
  }
}

console.log('=== A. 噪声过滤（纯函数） ===');
ok('歌单伪歌手「流行摇滚」被判噪声', looksLikeCuratedArtist('流行摇滚', '摇滚'));
ok('歌单伪歌手「我的摇滚青春」被判噪声', looksLikeCuratedArtist('我的摇滚青春', '摇滚'));
ok('「Today\u2019s Hits」被判噪声', looksLikeCuratedArtist("Today's Hits", '摇滚'));
ok('真乐队 The Beatles 不误杀', !looksLikeCuratedArtist('The Beatles', '摇滚'));
ok('Kid Rock 不误杀（名字里含 Rock）', !looksLikeCuratedArtist('Kid Rock', '摇滚'));
ok('草蜢 不误杀（纯中文但不含流派词）', !looksLikeCuratedArtist('草蜢', '摇滚'));

console.log('\n=== B. 流派榜单映射 ===');
ok('摇滚 → 21 号榜', GENRE_RSS['摇滚']?.id === 21);
ok('Hip-Hop → 18 号榜', GENRE_RSS['hiphop']?.id === 18);
ok('华语流派故意不进榜单表（交给关键词源）', !GENRE_RSS['國語流行樂']);

console.log('\n=== C. 真·外部接口（摇滚 / Hip-Hop） ===');
const bigRock = [
  'Pink Floyd',
  'Fleetwood Mac',
  'Journey',
  'Boston',
  'TOOL',
  'Deep Purple',
  'Metallica',
  'Queen',
  'The Beatles',
  'Led Zeppelin',
  'Eagles',
  'Def Leppard',
  'Nirvana',
  'Guns N\u2019 Roses',
];
const bigHip = ['Drake', 'JAŸ-Z', 'Jay-Z', 'Eminem', 'Kanye West', 'Kendrick Lamar', 'The Game', '50 Cent', 'Macklemore'];

await connectDb();

const rock = await discoverGenreArtists('摇滚', { limit: 30 });
console.log(`  摇滚：来源=${rock.source} 共${rock.total}位  → ` + rock.artists.map((a) => a.name).join(' / '));
ok('摇滚结果 ≥ 20 位', rock.total >= 20, `实得 ${rock.total}`);
const rockHits = rock.artists.filter((a) => bigRock.some((b) => a.name.toLowerCase().includes(b.toLowerCase())));
ok('摇滚含 ≥5 位经典大咖', rockHits.length >= 5, `命中 ${rockHits.length}：${rockHits.map((a) => a.name).join('、')}`);
ok('摇滚结果里无歌单伪歌手', !rock.artists.some((a) => looksLikeCuratedArtist(a.name, '摇滚')));

const hip = await discoverGenreArtists('Hip-Hop', { limit: 30 });
console.log(`  Hip-Hop：来源=${hip.source} 共${hip.total}位  → ` + hip.artists.map((a) => a.name).join(' / '));
ok('Hip-Hop 结果 ≥ 20 位', hip.total >= 20, `实得 ${hip.total}`);
const hipHits = hip.artists.filter((a) => bigHip.some((b) => a.name.toLowerCase().includes(b.toLowerCase())));
ok('Hip-Hop 含 ≥3 位欧美说唱大咖', hipHits.length >= 3, `命中 ${hipHits.length}：${hipHits.map((a) => a.name).join('、')}`);
const hasCn = hip.artists.some((a) => /[\u4e00-\u9fa5]/.test(a.name));
ok('Hip-Hop 里同时有华语歌手（两区穿插生效）', hasCn);

console.log('\n=== D. 华语系流派仍可用 ===');
const mandopop = await discoverGenreArtists('國語流行樂', { limit: 12 });
console.log(`  國語流行樂：来源=${mandopop.source} 共${mandopop.total}位  → ` + mandopop.artists.map((a) => `${a.name}(${a.genre || '-'})`).join(' / '));
ok('國語流行樂 有结果', mandopop.total >= 5, `实得 ${mandopop.total}`);
ok('國語流行樂 走关键词源', mandopop.source === 'keyword');

await disconnectDb();

console.log(`\n===== 流派扩库验证：${pass}/${pass + fail} 通过 =====`);
process.exit(fail ? 1 : 0);
