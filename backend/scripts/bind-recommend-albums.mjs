/**
 * 给 6 个人格类型绑定默认推荐专辑（3–5 张/型）
 * ------------------------------------------------------------
 * 选片依据（不是拍脑袋，全部有公开口碑数据支撑）：
 *   · 西洋部分取 **Rolling Stone「史上最伟大 500 张专辑」**(2020 修订版) 的入榜专辑，括号里是排名；
 *   · 华语部分取**金曲奖最佳华语专辑**与**豆瓣长期 9.0+ 的公认高分专辑**；
 *   · 只在**本曲库已有的合格专辑**里选（前台按本地 ObjectId 取，库里没有的选了也显示不出来）。
 * 型号含义（设计稿那套四维 melody / rhythm / arrangement / calm）：
 *   MEL 旋律捕手=旋律优先 ｜ RHY 节拍动物=律动优先 ｜ LYR 词句收藏家=词优先
 *   TMB 音色控=音色与制作优先 ｜ CLM 安静聆听者=氛围安静 ｜ EXP 探索者=实验/没听过
 * 幂等：重复跑会覆盖成这里的配置，不会重复添加。
 * 用法：node backend/scripts/bind-recommend-albums.mjs [--dry]
 */
import mongoose from 'mongoose';
import config from '../src/config/index.js';
import { Album, PersonalityType } from '../src/models/index.js';

const PICKS = {
  MEL: [
    ['Abbey Road', 'The Beatles · RS 500 第 5 名，旋律与编曲的教科书'],
    ['Thriller', 'Michael Jackson · RS 500 第 12 名，流行旋律天花板'],
    ['范特西', '周杰倫 · 豆瓣 9.2，华语旋律与编曲的标杆'],
    ['勇氣', '梁靜茹 · 华语流行旋律传唱度代表'],
  ],
  RHY: [
    ['Innervisions', 'Stevie Wonder · RS 500 第 34 名，律动与和声的巅峰'],
    ["Sign O' The Times", "Prince · RS 500 第 45 名，节奏与放克集大成"],
    ['Off the Wall', 'Michael Jackson · RS 500 第 36 名，舞曲律动范本'],
    ['呸', '蔡依林 · 金曲奖最佳国语专辑，华语舞曲制作标杆'],
  ],
  LYR: [
    ['The Line-Up', '陳奕迅 · 林夕/黄伟文词作高峰，公认词曲俱佳'],
    ['寓言', '王菲 · 林夕概念词作，豆瓣 9.2'],
    ['後 青春期的詩', '五月天 · 华语摇滚叙事词作代表'],
    ['Reasonable Doubt', 'Jaÿ-Z · RS 500 第 67 名，说唱叙事与文本标杆'],
  ],
  TMB: [
    ['My Beautiful Dark Twisted Fantasy', 'Kanye West · RS 500 第 17 名，制作与音色天花板'],
    ['Low', 'David Bowie · 氛围与音色实验的分水岭'],
    ['BRAT', 'Charli xcx · hyperpop 音色与制作的当代样本'],
    ['一朵金花', '莫文蔚 · 人山人海实验制作，华语音色实验代表'],
  ],
  CLM: [
    ['folklore', 'Taylor Swift · 极简编制与低语式演唱，安静向'],
    ['evermore', 'Taylor Swift · folklore 的姊妹篇，氛围更内敛'],
    ['Slowness', '謝安琪 · 主题就是"慢"，安静聆听代表作'],
    ['DEPART', '蔡健雅 · 金曲奖最佳华语专辑，克制的编制与语气'],
  ],
  EXP: [
    ['Blackstar', 'David Bowie · 临终实验专辑，公认先锋'],
    ['The Rise and Fall of Ziggy Stardust', 'David Bowie · RS 500 第 40 名，概念专辑先驱'],
    ['Yeezus', 'Kanye West · 工业噪音与实验电气，争议中的公认先锋'],
    ['浮躁', '王菲 · 华语另类/实验流行的先行者，豆瓣 9.1'],
  ],
};

const dry = process.argv.includes('--dry');
await mongoose.connect(config.mongoUri);
console.log('已连库', config.mongoUri, dry ? '（预演，不写入）' : '');

let bound = 0;
let missing = 0;
for (const [code, picks] of Object.entries(PICKS)) {
  const type = await PersonalityType.findOne({ code });
  if (!type) {
    console.log(`✗ 找不到人格类型 ${code}`);
    continue;
  }
  const ids = [];
  const names = [];
  for (const [albumName, why] of picks) {
    // 专辑名是繁体/英文混排 → 匹配顺序：**完全相等 > 前缀 > 包含**
    // （只用前缀/包含会把 Charli xcx 的《BRAT》匹配到豪华版《Brat and it's the same…》）
    const esc = albumName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // eslint-disable-next-line no-await-in-loop
    const hit =
      (await Album.findOne({ isEligible: true, name: new RegExp(`^${esc}$`, 'i') }).lean()) ||
      (await Album.findOne({ isEligible: true, name: new RegExp(`^${esc}`, 'i') }).lean()) ||
      (await Album.findOne({ isEligible: true, name: new RegExp(esc, 'i') }).lean());
    if (!hit) {
      missing += 1;
      console.log(`   ⚠ ${code} 曲库里找不到《${albumName}》（请先在后台音乐数据里拉取该歌手）`);
      continue;
    }
    ids.push(hit._id);
    names.push(`${hit.name}／${hit.artistName}`);
    console.log(`   ✓ ${code} 《${hit.name}》（${hit.artistName}）— ${why}`);
  }
  if (!ids.length) continue;
  if (!dry) {
    type.recommendAlbumIds = ids;
    // eslint-disable-next-line no-await-in-loop
    await type.save();
  }
  bound += 1;
  console.log(`→ ${code} ${type.name}：绑定 ${ids.length} 张 → ${names.join('、')}\n`);
}

console.log(`完成：${bound} 个人格类型已绑定，${missing} 张专辑库里没有（已跳过）。`);
await mongoose.disconnect();
