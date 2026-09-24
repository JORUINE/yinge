/** 临时：通过真实接口验证白名单覆盖（韩国流行乐 / 日本流行乐 / 華語 Hip-Hop） */
const BASE = 'http://127.0.0.1:3000/api';

const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'admin', password: 'admin123456' }),
}).then((r) => r.json());
const token = login?.data?.token;
if (!token) {
  console.log('FATAL 登录失败', JSON.stringify(login).slice(0, 200));
  process.exit(2);
}
console.log('已登录, token len', token.length);

for (const g of ['韩国流行乐', '日本流行乐', '華語 Hip-Hop', '流行樂']) {
  const url = `${BASE}/music/genres/whitelist?genre=${encodeURIComponent(g)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => null);
  const x = j?.data || {};
  const miss = (x.artists || []).filter((a) => !a.cached).map((a) => a.name);
  console.log(`\n=== ${g} ===  total=${x.total} cached=${x.cached}`);
  console.log(`  未入库(${miss.length}):`, miss.join('、') || '无 ✅');
}
