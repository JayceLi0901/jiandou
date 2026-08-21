/* 鉴豆 · 工具函数：日期、状态计算、格式化 */

/* 评分维度：花香/果香/甜感/余韵 直接打分（越高越好）；
   酸质与 Body 为「中心分」：滑条记录强度感受，5 = 完美平衡满分，偏离扣分
   「整体」自动 = 各维得分平均 */
export const RATING_DIMS = [
  { key: 'floral',     label: '花香' },
  { key: 'fruity',     label: '果香' },
  { key: 'sweet',      label: '甜感' },
  { key: 'aftertaste', label: '余韵' },
  { key: 'acidity',    label: '酸质', special: true },
  { key: 'body',       label: 'Body', special: true },
];

/* 中心分计分：5 = 满分，偏离每 1 分扣 2 分（酸质与 Body 共用） */
export function centerScore(raw) {
  if (raw == null || raw === '') return null;
  return Math.max(0, Math.round((10 - 2 * Math.abs(Number(raw) - 5)) * 10) / 10);
}
export const bodyScore = centerScore;

/* 单条评分 → 各维得分 + 自动整体（0 或空 = 不适用，跳过） */
export function ratingScores(rating) {
  const out = {};
  const vals = [];
  for (const d of RATING_DIMS) {
    const v = Number(rating?.[d.key]);
    if (d.special) {
      out[d.key] = centerScore(rating?.[d.key]);
      if (out[d.key] != null && out[d.key] > 0) vals.push(out[d.key]);
    } else {
      out[d.key] = Number.isNaN(v) ? null : v;
      if (!Number.isNaN(v) && v > 0) vals.push(v);
    }
  }
  out.overall = vals.length ? Math.round((vals.reduce((s, x) => s + x, 0) / vals.length) * 10) / 10 : 0;
  return out;
}

/* ---------- 基础 ---------- */
export function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

/* 保留 1 位小数并去掉多余的 .0 */
export function fmtG(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return String(v);
}

/* 冲煮时长：'2:30' 或 '150' → 秒 */
export function parseDuration(s) {
  if (!s) return null;
  const str = String(s).trim().replace(/[分'’]/g, ':').replace(/["”秒]/g, '');
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(str);
  if (m) return (+m[1]) * 60 + (+m[2]);
  const n = parseInt(str, 10);
  return Number.isNaN(n) ? null : n;
}

/* 秒 → 2'30" 展示 */
export function fmtDuration(sec) {
  if (sec == null || sec === '') return '';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}'${String(s).padStart(2, '0')}"` : `${s}"`;
}

/* ---------- 日期 ---------- */
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDate(str) {
  if (!str) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(str).trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function daysBetween(fromStr, toStr) {
  const a = parseDate(fromStr), b = parseDate(toStr ?? todayStr());
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export function fmtCN(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/* ---------- 豆子状态 ----------
   resting  养豆中（烘焙后未到养豆天数）
   ready    适饮期（养豆完成 ~ 再过 45 天）
   aging    临期（超过适饮窗口，风味衰退）
   finished 已喝完（剩余克重 ≤ 0）
---------------------------------- */
export const STATUS_META = {
  resting:  { label: '养豆中', cls: 'resting' },
  ready:    { label: '适饮期', cls: 'ready' },
  aging:    { label: '临期',   cls: 'aging' },
  finished: { label: '已喝完', cls: 'finished' },
};

const READY_WINDOW = 45; // 养豆完成后再享饮 45 天

export function statusOf(bean, today = todayStr()) {
  if ((Number(bean.remainingWeight) || 0) <= 0) {
    return { key: 'finished', ...STATUS_META.finished, daysSince: null };
  }
  const days = daysBetween(bean.roastDate, today);
  if (days == null) return { key: 'ready', ...STATUS_META.ready, daysSince: null };
  if (days < bean.restDays) {
    return { key: 'resting', ...STATUS_META.resting, daysSince: days, daysToReady: bean.restDays - days };
  }
  if (days <= bean.restDays + READY_WINDOW) {
    return { key: 'ready', ...STATUS_META.ready, daysSince: days };
  }
  return { key: 'aging', ...STATUS_META.aging, daysSince: days };
}

/* 顶部「今天开喝」横幅：今天正好养好 + 近 3 天内刚养好但还没动过的 */
export function bannerBeans(beans, today = todayStr()) {
  const hit = { today: [], recent: [] };
  for (const b of beans) {
    if (b.archived) continue;
    if ((Number(b.remainingWeight) || 0) <= 0) continue;
    const days = daysBetween(b.roastDate, today);
    if (days == null) continue;
    if (days === b.restDays) hit.today.push(b);
    else if (days > b.restDays && days <= b.restDays + 3) hit.recent.push(b);
  }
  return hit;
}

/* 豆仓排序：适饮期 → 养豆中(刚烘焙靠前) → 临期 → 已喝完 */
const ORDER = { ready: 0, resting: 1, aging: 2, finished: 3 };
export function sortBeans(beans) {
  return [...beans].sort((a, b) => {
    const sa = ORDER[statusOf(a).key], sb = ORDER[statusOf(b).key];
    if (sa !== sb) return sa - sb;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

/* ---------- 评分（多条平均；overall 为逐条自动整体的均值） ---------- */
export function avgRatings(txs) {
  const rated = txs.filter((t) => t.rating);
  if (!rated.length) return null;
  const out = { _count: rated.length };
  let overallSum = 0, overallN = 0;
  for (const t of rated) {
    const s = ratingScores(t.rating);
    overallSum += s.overall; overallN++;
    for (const d of RATING_DIMS) {
      if (s[d.key] != null && s[d.key] > 0) {
        out['_' + d.key] = (out['_' + d.key] || 0) + s[d.key];
        out['_n' + d.key] = (out['_n' + d.key] || 0) + 1;
      }
    }
  }
  for (const d of RATING_DIMS) {
    out[d.key] = out['_n' + d.key] ? Math.round((out['_' + d.key] / out['_n' + d.key]) * 10) / 10 : 0;
  }
  out.overall = overallN ? Math.round((overallSum / overallN) * 10) / 10 : 0;
  return out;
}

/* ---------- 剩余克重 ---------- */
export function calcRemaining(bean, txs) {
  let r = Number(bean.totalWeight) || 0;
  for (const t of txs) {
    if (t.type === 'adjust') r += Number(t.grams) || 0;
    else r -= Number(t.grams) || 0;
  }
  return Math.round(r * 10) / 10;
}

/* ---------- 图片压缩 ---------- */
export async function compressImage(file, maxSide = 1280, quality = 0.82) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    const url = URL.createObjectURL(file);
    i.onload = () => { URL.revokeObjectURL(url); res(i); };
    i.onerror = rej;
    i.src = url;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
}
