/* 鉴豆 · 云同步引擎（端到端加密）
   密码 --PBKDF2(salt:auth)--> kAuth  登录凭证，仅此一把钥匙发给服务器
        --PBKDF2(salt:enc)-->  kEnc   AES-256-GCM 加密密钥，永不出本机
   服务器只存：验证哈希 + 密文。密码错误则永远无法解密。 */
import { db } from './db.js';

const ITER = 150000;
const TE = new TextEncoder();
const TD = new TextDecoder();
const SESSION_KEY = 'jd-sync-session';

/* ---------- 基础工具 ---------- */
function hex(u8) { return [...u8].map((x) => x.toString(16).padStart(2, '0')).join(''); }
function b64(u8) { let s = ''; u8.forEach((b) => s += String.fromCharCode(b)); return btoa(s); }
function unb64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

function randHex(n) { return hex(crypto.getRandomValues(new Uint8Array(n))); }

async function pbkdf2(password, saltHex, label) {
  const key = await crypto.subtle.importKey('raw', TE.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: TE.encode(saltHex + ':' + label), iterations: ITER },
    key, 256
  );
  return new Uint8Array(bits);
}

async function aesKey(raw) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function normalizeServer(s) {
  s = String(s || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(s)) s = 'https://' + s;
  return s;
}

/* ---------- 会话 ---------- */
export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch (_) { return null; }
}
export function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
export function clearSession() { localStorage.removeItem(SESSION_KEY); }

/* ---------- 加解密 ---------- */
async function encryptBlob(session, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(unb64(session.kEncB64)), TE.encode(JSON.stringify(obj)));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv); out.set(new Uint8Array(ct), 12);
  return b64(out);
}

async function decryptBlob(session, b64str) {
  const raw = unb64(b64str);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await aesKey(unb64(session.kEncB64)), raw.slice(12));
  return JSON.parse(TD.decode(pt));
}

/* ---------- 账号 ---------- */
export async function registerAccount(server, user, password) {
  server = normalizeServer(server);
  user = String(user || '').trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(user)) throw new Error('用户名需 3~20 位字母/数字/下划线');
  if (String(password || '').length < 6) throw new Error('密码至少 6 位');
  const salt = randHex(16);
  const kAuth = hex(await pbkdf2(password, salt, 'auth'));
  const kEnc = b64(await pbkdf2(password, salt, 'enc'));
  const res = await fetch(server + '/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, kAuth, salt }),
  });
  if (res.status === 409) throw new Error('用户名已被占用');
  if (!res.ok) throw new Error('注册失败（HTTP ' + res.status + '）');
  const session = { server, user: user.toLowerCase(), kAuth, kEncB64: kEnc };
  saveSession(session);
  return session;
}

export async function loginAccount(server, user, password) {
  server = normalizeServer(server);
  user = String(user || '').trim().toLowerCase();
  const r1 = await fetch(server + '/salt', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user }),
  });
  if (r1.status === 404) throw new Error('用户不存在，请先注册');
  if (!r1.ok) throw new Error('连接失败（HTTP ' + r1.status + '）');
  const { salt } = await r1.json();
  const kAuth = hex(await pbkdf2(password, salt, 'auth'));
  const kEnc = b64(await pbkdf2(password, salt, 'enc'));
  const res = await fetch(server + '/login', {
    method: 'POST',
    headers: { Authorization: `Bearer ${user} ${kAuth}` },
  });
  if (res.status === 401) throw new Error('密码错误');
  if (!res.ok) throw new Error('登录失败（HTTP ' + res.status + '）');
  const session = { server, user, kAuth, kEncB64: kEnc };
  saveSession(session);
  return session;
}

async function api(session, path, opts = {}) {
  return fetch(session.server + path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${session.user} ${session.kAuth}` },
  });
}

/* ---------- 同步 ---------- */
/* 推送：档案+流水（照片不参与云同步，仅存本机） */
export async function pushData(session) {
  const beans = await db.beans.all();
  const txs = await db.txs.all();
  if (!beans.length) return null;
  const payload = { app: 'jiandou-sync', ver: 1, exportedAt: Date.now(), beans, txs };
  const data = await encryptBlob(session, payload);
  const res = await api(session, '/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (res.status === 401) throw new Error('登录已失效，请重新登录');
  if (!res.ok) throw new Error('推送失败（HTTP ' + res.status + '）');
  const { updatedAt } = await res.json();
  await db.settings.set('cloudSyncedAt', updatedAt);
  return updatedAt;
}

/* 拉取：解密后按 ID 合并（upsert，不删本地已有） */
export async function pullData(session) {
  const res = await api(session, '/pull');
  if (res.status === 401) throw new Error('登录已失效，请重新登录');
  if (!res.ok) throw new Error('拉取失败（HTTP ' + res.status + '）');
  const { data, updatedAt } = await res.json();
  if (!data) return 0;
  const payload = await decryptBlob(session, data);
  if (payload.app !== 'jiandou-sync') throw new Error('云端数据格式异常');
  for (const b of payload.beans || []) await db.beans.put(b);
  for (const t of payload.txs || []) await db.txs.put(t);
  await db.settings.set('cloudSyncedAt', updatedAt);
  return (payload.beans || []).length;
}
