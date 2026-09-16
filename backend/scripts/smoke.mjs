/**
 * 启动冒烟测试（不依赖数据库）
 * ------------------------------------------------------------
 * 目的：验证应用能装配起来、中间件链与统一响应结构正确、
 *       公开且不查库的接口可正常返回。
 * 用法：node scripts/smoke.mjs
 * 说明：数据库相关断言不在本脚本内（需要真实 Mongo），故仅覆盖无库路径。
 */
process.env.JWT_SECRET ||= 'smoke-test-secret';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/yinge_smoke';
process.env.PORT ||= '0';
process.env.LOG_LEVEL ||= 'error';

const { default: createApp } = await import('../src/app.js');

const app = createApp();
const server = app.listen(0);

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  process.stdout.write(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

await new Promise((resolve) => server.once('listening', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function call(path, options) {
  const res = await fetch(`${base}${path}`, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* 忽略非 JSON 响应 */
  }
  return { status: res.status, body, headers: res.headers };
}

// 1. 存活探针
{
  const { status, body, headers } = await call('/health');
  record('GET /health 返回 ok', status === 200 && body?.status === 'ok', `status=${status}`);
  record('响应头带 X-Request-Id', Boolean(headers.get('x-request-id')));
}

// 2. 404 走统一响应结构
{
  const { status, body } = await call('/api/definitely-not-exist');
  record('未知接口返回 404 与 code=1002', status === 404 && body?.code === 1002, `code=${body?.code}`);
}

// 3. 参数校验失败走 1001（在查库前被拦截）
{
  const { status, body } = await call('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'x' }),
  });
  record('注册参数非法返回 1001', status === 422 && body?.code === 1001, `code=${body?.code}`);
}

// 4. 缺参校验
{
  const { body } = await call('/api/music/artists/search');
  record('歌手搜索缺参返回 1001', body?.code === 1001, `code=${body?.code}`);
}

// 5. 公开且不查库的接口
{
  const { status, body } = await call('/api/music/genres');
  const okShape = status === 200 && body?.code === 0 && Array.isArray(body?.data?.list);
  record('GET /api/music/genres 返回流派列表', okShape, `count=${body?.data?.list?.length}`);
}

// 6. 未登录访问受保护接口
{
  const { body } = await call('/api/battles');
  record('未登录访问 /api/battles 返回 2001', body?.code === 2001, `code=${body?.code}`);
}

server.close();

const failed = results.filter((r) => !r.pass);
process.stdout.write(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}\n`);
process.exit(failed.length ? 1 : 0);
