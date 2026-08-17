/* 鉴豆 · 通用 UI：toast、底部弹层、确认框、图片查看、震动 */
import { db } from './db.js';

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
