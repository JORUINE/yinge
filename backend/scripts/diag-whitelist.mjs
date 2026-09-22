/**
 * 诊断：D4 白名单在本库的实际覆盖率（是否与曲库命中、是否带可放试听）
 * 与 verify-personality-runtime.mjs 共用 mongod。
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Album, Track } from '../src/models/index.js';
import { AUDIO_WHITELIST } from '../src/data/personality.js';

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge');

const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-_·'’.,&()]/g, '');
const playableIds = await Track.distinct('albumId', { previewUrl: { $exists: true, $ne: null, $ne: '' } });
console.log('带试听的 album 数:', playableIds.length);

const albums = await Album.find({ _id: { $in: playableIds } }, 'name artistName genre').lean();
console.log('可放专辑对象数:', albums.length);

let total = 0, present = 0, playable = 0;
const missing = [];
for (const [tag, list] of Object.entries(AUDIO_WHITELIST)) {
  for (const w of list) {
    total += 1;
    const hit = albums.find((a) => norm(w.album) === norm(a.name) && norm(w.artist) === norm(a.artistName));
    if (hit) {
      present += 1; playable += 1;
    } else {
      missing.push(`${tag}: ${w.artist} – ${w.album}`);
    }
  }
}
console.log(`白名单条目: ${total}  本库命中(且可放): ${playable}  缺失: ${total - playable}`);
console.log('缺失清单:');
for (const m of missing) console.log('   -', m);

await mongoose.disconnect();
process.exit(0);
