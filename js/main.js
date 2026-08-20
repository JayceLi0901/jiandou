/* 鉴豆 · 入口：hash 路由 + 顶栏/底栏状态 + Service Worker */
import { revokePhotoUrls } from './ui.js';
import { db } from './db.js';
import { mirrorSnapshot } from './backup.js';
import { getSession, pushData, pullData } from './sync.js';
import * as home from './views/home.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';
import * as add from './views/add.js';
import * as detail from './views/detail.js';
import * as equip from './views/equip.js';

const view = document.getElementById('view');
const app = document.getElementById('app');
const topbar = document.getElementById('topbar');
const pageTitle = document.getElementById('page-title');
const backBtn = document.getElementById('back-btn');

/* #/            → 豆仓
   #/equip       → 器具
   #/stats       → 统计
   #/settings    → 设置
   #/add         → 建档
   #/add/:id     → 编辑
   #/bean/:id    → 详情 */
function parseRoute() {
  const h = (location.hash || '#/').replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (!parts.length) return { name: 'home', tab: 'home' };
  if (parts[0] === 'equip') return { name: 'equip', tab: 'equip' };
  if (parts[0] === 'stats') return { name: 'stats', tab: 'stats' };
  if (parts[0] === 'settings') return { name: 'settings', tab: 'settings' };
  if (parts[0] === 'add') return { name: 'add', tab: 'home', sub: true, title: parts[1] ? '编辑档案' : '拍照建档', params: { id: parts[1] } };
  if (parts[0] === 'bean') return { name: 'bean', tab: 'home', sub: true, title: '豆子档案', params: { id: parts[1] } };
  return { name: 'home', tab: 'home' };
}

async function router() {
  const r = parseRoute();
  revokePhotoUrls();
  /* 路由切换时清理可能残留的弹层/遮罩 */
  document.getElementById('sheet-root').innerHTML = '';

  /* 底栏高亮 */
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === r.tab);
  });

  /* 子页面：显示顶栏返回、隐藏底栏 */
  const isSub = !!r.sub;
  topbar.hidden = !isSub;
  app.classList.toggle('sub', isSub);
  if (isSub) pageTitle.textContent = r.title || '';

  /* 切换动画 */
  view.classList.remove('enter');
  void view.offsetWidth;
  view.classList.add('enter');
  view.scrollTop = 0;

  try {
    switch (r.name) {
      case 'stats': await stats.render(view); break;
      case 'settings': await settings.render(view); break;
      case 'equip': await equip.render(view); break;
      case 'add': await add.render(view, r.params); break;
      case 'bean': await detail.render(view, r.params); break;
      default: await home.render(view);
    }
  } catch (e) {
    view.innerHTML = `<div class="empty"><div class="empty-art">⚠️</div><h3>页面出错了</h3><p>${String(e.message || e).replace(/[<>]/g, '')}</p></div>`;
    console.error(e);
  }

  /* 每次渲染后写一份镜像快照到 localStorage 保险箱 */
  mirrorSnapshot().catch(() => {});
}

backBtn.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.hash = '#/';
});

window.addEventListener('hashchange', router);
router().then(async () => {
  /* 云同步：登录过则开屏静默「先拉后推」合并 */
  const session = getSession();
  if (session) {
    pullData(session).then(() => pushData(session)).catch(() => {});
  }
});

/* 申请持久存储：防止安卓在磁盘紧张时自动清理本地档案 */
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

/* Service Worker（离线缓存） */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
