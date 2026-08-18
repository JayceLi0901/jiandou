/* 鉴豆 · 通用 UI：toast、底部弹层、确认框、图片查看、震动 */
import { db } from './db.js';

/* 咖啡豆 SVG 插画（与 App 图标同款造型），替代 emoji 避免安卓渲染成红豆 */
let _bmSeq = 0;
export function beanMark(size = 88) {
  const g = 'bmg' + (++_bmSeq), f = 'bmf' + _bmSeq;
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex-shrink:0;">
  <defs>
    <radialGradient id="${g}" cx="0.36" cy="0.30" r="1.0">
      <stop offset="0" stop-color="#7E5636"/><stop offset="0.5" stop-color="#5C3D24"/><stop offset="1" stop-color="#3E2917"/>
    </radialGradient>
    <filter id="${f}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <ellipse cx="270" cy="400" rx="150" ry="30" fill="#3E2A1A" opacity="0.14" filter="url(#${f})"/>
  <g transform="rotate(32 256 250)">
    <ellipse cx="256" cy="250" rx="128" ry="168" fill="url(#${g})"/>
    <ellipse cx="256" cy="250" rx="126" ry="166" fill="none" stroke="#2E1C0E" stroke-opacity="0.3" stroke-width="4"/>
    <path d="M 172 158 C 196 118 244 100 292 110" fill="none" stroke="#EACD9F" stroke-opacity="0.4" stroke-width="20" stroke-linecap="round"/>
    <path d="M 256 92 C 314 140 314 190 256 250 C 198 310 198 360 256 408" fill="none" stroke="#2A1808" stroke-opacity="0.2" stroke-width="34" stroke-linecap="round" transform="translate(4 5)"/>
    <path d="M 256 92 C 314 140 314 190 256 250 C 198 310 198 360 256 408" fill="none" stroke="#F6EEDA" stroke-width="26" stroke-linecap="round"/>
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

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    mask.remove(); s.remove();
    onClose && onClose();
  };
  if (dismissable) mask.addEventListener('click', close);
  root.append(mask, s);
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
