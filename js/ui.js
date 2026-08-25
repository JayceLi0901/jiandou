/* 鉴豆 · 通用 UI：toast、底部弹层、确认框、图片查看、震动 */
import { db } from './db.js';

/* 咖啡豆 SVG 插画（与 App 图标同款造型），替代 emoji 避免安卓渲染成红豆 */
let _bmSeq = 0;
export function beanMark(size = 88) {
  const s = ++_bmSeq;
  const g = 'bmg' + s, f = 'bmf' + s, m = 'bmm' + s, c = 'bmc' + s;
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex-shrink:0;">
  <defs>
    <radialGradient id="${g}" cx="0.36" cy="0.30" r="1.0">
      <stop offset="0" stop-color="#7E5636"/><stop offset="0.5" stop-color="#5C3D24"/><stop offset="1" stop-color="#3E2917"/>
    </radialGradient>
    <filter id="${f}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
    <filter id="${m}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>
    <clipPath id="${c}"><ellipse cx="256" cy="250" rx="128" ry="168"/></clipPath>
  </defs>
  <ellipse cx="288" cy="410" rx="134" ry="22" fill="#3E2A1A" opacity="0.15" filter="url(#${f})"/>
  <g transform="rotate(32 256 250)">
    <ellipse cx="256" cy="250" rx="128" ry="168" fill="url(#${g})"/>
    <g clip-path="url(#${c})">
      <ellipse cx="304" cy="316" rx="150" ry="192" fill="#241203" opacity="0.28" filter="url(#${f})"/>
      <path d="M 130 221 A 128 168 0 0 1 212 92" fill="none" stroke="#FFE9C4" stroke-opacity="0.30" stroke-width="16" stroke-linecap="round" filter="url(#${m})"/>
    </g>
    <path d="M 256 92 C 314 140 314 190 256 250 C 198 310 198 360 256 408" fill="none" stroke="#F6EEDA" stroke-width="26" stroke-linecap="round"/>
    <ellipse cx="256" cy="250" rx="127" ry="167" fill="none" stroke="#26150A" stroke-opacity="0.15" stroke-width="3"/>
  </g></svg>`;
}

export function toast(msg, type = '') {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s, transform .3s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(6px)';
    setTimeout(() => t.remove(), 320);
  }, 1900);
}

export function vibrate(ms = 8) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {}
}

/* 底部弹层：html 可为字符串或 Node；返回 { close, el } */
export function sheet({ title = '', html = '', onMount, onClose, dismissable = true } = {}) {
  const root = document.getElementById('sheet-root');
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  const s = document.createElement('div');
  s.className = 'sheet';
  s.innerHTML = `<div class="sheet-grab"></div>${title ? `<div class="sheet-title">${title}</div>` : ''}<div class="sheet-body"></div>`;
  const body = s.querySelector('.sheet-body');
  if (typeof html === 'string') body.innerHTML = html;
  else if (html) body.appendChild(html);
  /* 需要常驻的主操作移出滚动区，避免覆盖评分滑条等表单控件。 */
  const saveBar = body.querySelector(':scope > .sheet-save-bar');
  if (saveBar) s.appendChild(saveBar);

  let closed = false;
  /* Android WebView 从后台恢复时重新确认裁切，避免旧合成层在圆角处闪黑。 */
  const stabilize = () => {
    if (closed || document.hidden) return;
    s.style.animation = 'none';
    s.style.transform = 'none';
    s.style.willChange = 'auto';
    void s.offsetHeight;
  };
  const onVisible = () => { if (!document.hidden) requestAnimationFrame(stabilize); };
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', stabilize);
    mask.remove(); s.remove();
    onClose && onClose();
  };
  if (dismissable) mask.addEventListener('click', close);
  root.append(mask, s);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', stabilize);
  /* 入场结束后彻底移除 transform，不让圆角滚动层长期停留在 GPU 合成层。 */
  s.addEventListener('animationend', stabilize, { once: true });
  onMount && onMount(s, close);
  return { close, el: s };
}

/* 确认框（Promise<boolean>） */
export function confirmBox(title, desc = '', { okText = '确定', danger = false } = {}) {
  return new Promise((resolve) => {
    const html = `
      <div style="text-align:center;padding:4px 6px 2px;">
        <div style="font-family:var(--serif);font-size:16.5px;font-weight:700;margin-bottom:8px;">${title}</div>
        ${desc ? `<div class="muted" style="line-height:1.6;">${desc}</div>` : ''}
      </div>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn ghost" style="flex:1;" data-act="no">取消</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" style="flex:1;" data-act="yes">${okText}</button>
      </div>`;
    const { close } = sheet({
      html,
      dismissable: true,
      onClose: () => resolve(false),
      onMount(el, close) {
        el.querySelector('[data-act="no"]').onclick = () => { resolve(false); close(); };
        el.querySelector('[data-act="yes"]').onclick = () => { resolve(true); close(); };
      },
    });
  });
}

/* 全屏看图 */
export function viewImage(url) {
  const root = document.getElementById('sheet-root');
  const mask = document.createElement('div');
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(20,15,10,.92);z-index:90;display:grid;place-items:center;animation:fadeIn .2s ease both;';
  const img = document.createElement('img');
  img.src = url;
  img.style.cssText = 'max-width:94vw;max-height:88dvh;border-radius:14px;';
  mask.appendChild(img);
  mask.onclick = () => mask.remove();
  root.appendChild(mask);
}

/* 照片 blob → URL（集中管理，切页时统一回收） */
const liveUrls = new Map();
export async function photoURL(bean) {
  if (!bean || !bean.photoId) return null;
  if (liveUrls.has(bean.photoId)) return liveUrls.get(bean.photoId);
  const blob = await db.photos.get(bean.photoId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  liveUrls.set(bean.photoId, url);
  return url;
}
export function revokePhotoUrls() {
  for (const u of liveUrls.values()) URL.revokeObjectURL(u);
  liveUrls.clear();
}
