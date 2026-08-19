/* 鉴豆云同步服务 · Cloudflare Worker + KV
   端到端加密：服务器只存密文与验证哈希，永远接触不到明文与加密密钥
   环境变量：SYNC_KV (KV namespace)、ADMIN_TOKEN (管理令牌)、ALLOW_ORIGINS (逗号分隔的允许来源)
*/
const MAX_BODY = 20 * 1024 * 1024; // 20MB

function json(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'no-store',
    },
  });
}

function sha256hex(s) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then((b) =>
    [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
  );
}

const USER_RE = /^[a-zA-Z0-9_]{3,20}$/;
const HEX64_RE = /^[a-f0-9]{64}$/;
const HEX32_RE = /^[a-f0-9]{16,64}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = (env.ALLOW_ORIGINS || '*').split(',').find((o) => o === request.headers.get('Origin')) || '*';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'method' }, 405, origin);

    const path = url.pathname.replace(/\/+$/, '') || '/';
    const kv = env.SYNC_KV;

    /* 健康检查 */
    if (path === '/' && request.method === 'GET') return json({ ok: true, service: 'jiandou-sync', time: Date.now() }, 200, origin);

    /* 管理统计 */
    if (path === '/stats' && request.method === 'GET') {
      if (request.headers.get('X-Admin-Token') !== (env.ADMIN_TOKEN || '')) return json({ error: 'unauthorized' }, 401, origin);
      const list = await kv.list({ prefix: 'user:' });
      let latest = 0;
      for (const k of list.keys) {
        const rec = JSON.parse((await kv.get(k.name)) || '{}');
        if (rec.updatedAt > latest) latest = rec.updatedAt;
      }
      return json({ users: list.keys.length, lastUpdate: latest }, 200, origin);
    }

    /* 注册 */
    if (path === '/register' && request.method === 'POST') {
      const { user, kAuth, salt } = await request.json().catch(() => ({}));
      if (!USER_RE.test(user || '')) return json({ error: 'bad_user' }, 400, origin);
      if (!HEX64_RE.test(kAuth || '')) return json({ error: 'bad_auth_key' }, 400, origin);
      if (!HEX32_RE.test(salt || '')) return json({ error: 'bad_salt' }, 400, origin);
      const key = 'user:' + user.toLowerCase();
      if (await kv.get(key)) return json({ error: 'exists' }, 409, origin);
      const verifier = await sha256hex(kAuth + ':' + user.toLowerCase());
      await kv.put(key, JSON.stringify({ user: user.toLowerCase(), salt, verifier, data: null, updatedAt: 0, createdAt: Date.now() }));
      return json({ ok: true }, 200, origin);
    }

    /* 取派生盐（登录第一步） */
    if (path === '/salt' && request.method === 'POST') {
      const { user } = await request.json().catch(() => ({}));
      const rec = JSON.parse((await kv.get('user:' + String(user || '').toLowerCase())) || 'null');
      if (!rec) return json({ error: 'no_user' }, 404, origin);
      return json({ salt: rec.salt, updatedAt: rec.updatedAt }, 200, origin);
    }

    /* 以下均需鉴权：Authorization: Bearer <user> <kAuth> */
    const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').split(' ');
    const user = String(auth[0] || '').toLowerCase();
    const kAuth = String(auth[1] || '');
    const rec = JSON.parse((await kv.get('user:' + user)) || 'null');
    if (!rec || HEX64_RE.test(kAuth) === false) return json({ error: 'unauthorized' }, 401, origin);
    const verifier = await sha256hex(kAuth + ':' + user);
    if (verifier !== rec.verifier) return json({ error: 'unauthorized' }, 401, origin);

    /* 登录验证 */
    if (path === '/login' && request.method === 'POST') {
      return json({ ok: true, user, updatedAt: rec.updatedAt }, 200, origin);
    }

    /* 拉取 */
    if (path === '/pull' && request.method === 'GET') {
      return json({ data: rec.data, updatedAt: rec.updatedAt }, 200, origin);
    }

    /* 推送 */
    if (path === '/push' && request.method === 'POST') {
      if ((request.headers.get('Content-Length') | 0) > MAX_BODY) return json({ error: 'too_large' }, 413, origin);
      const { data } = await request.json().catch(() => ({}));
      if (typeof data !== 'string' || !data.length || data.length > MAX_BODY) return json({ error: 'bad_data' }, 400, origin);
      const now = Date.now();
      rec.data = data;
      rec.updatedAt = now;
      await kv.put('user:' + user, JSON.stringify(rec));
      return json({ ok: true, updatedAt: now }, 200, origin);
    }

    return json({ error: 'not_found' }, 404, origin);
  },
};
