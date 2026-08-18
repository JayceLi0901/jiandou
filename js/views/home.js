/* 鉴豆 · 豆仓（首页）：今日开喝横幅 + 豆子卡片列表 + 归档；长按/左滑删除 */
import { db, deleteBeanDeep } from '../db.js';
import { bannerBeans, sortBeans, statusOf, fmtG, esc } from '../util.js';
import { photoURL, toast, vibrate, confirmBox } from '../ui.js';

export async function render(view) {
  const beans = await db.beans.all();
  const active = beans.filter((b) => !b.archived);
  const archived = beans.filter((b) => b.archived);

  const banner = bannerBeans(active);
  const sorted = sortBeans(active);

  let html = `
    <div class="page-head">
      <div class="page-title">豆仓</div>
      <div class="page-sub">${active.length ? `在存 ${active.length} 包 · 共 ${fmtG(active.reduce((s, b) => s + (Number(b.remainingWeight) || 0), 0))} g` : '你的咖啡豆档案库'}</div>
    </div>`;

  /* 今日开喝横幅 */
  const bn = [...banner.today, ...banner.recent];
  if (bn.length) {
    const todayN = banner.today.length;
    html += `
    <a class="banner" href="#/bean/${bn[0].id}" style="display:block;">
      <div class="banner-title">${todayN ? '🎉 今天开喝' : '🫘 已养好，等你开喝'}</div>
      <div class="banner-beans">${bn.slice(0, 4).map((b) => `<span class="banner-chip">${esc(b.name || '未命名')}</span>`).join('')}${bn.length > 4 ? `<span class="banner-chip">等 ${bn.length} 包</span>` : ''}</div>
    </a>`;
  }

  /* 无豆子空状态 */
  if (!beans.length) {
    view.innerHTML = html + `
      <div class="empty">
        <div class="empty-art">🫘</div>
        <h3>豆仓空空如也</h3>
        <p>拍一张包装袋照片，开始第一份豆子档案</p>
        <div class="mt-14"><a class="btn primary" href="#/add">拍照建档</a></div>
      </div>`;
    return;
  }

  /* 在喝 / 归档 切换 */
  html += `
    <div class="seg" id="home-seg" style="margin-bottom:14px;">
      <button data-m="active" class="on">在喝 ${active.length}</button>
      <button data-m="archived">归档 ${archived.length}</button>
    </div>
    <div id="bean-list"></div>`;
  view.innerHTML = html;

  const list = view.querySelector('#bean-list');
  const seg = view.querySelector('#home-seg');
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    const isArch = btn.dataset.m === 'archived';
    drawList(isArch ? archived : sorted, list, isArch);
  });
  drawList(sorted, list, false);
}

async function drawList(beans, list, isArchived) {
  if (!beans.length) {
    list.innerHTML = `<div class="empty" style="padding:36px 20px;"><div class="empty-art">🍂</div><h3>暂无豆子</h3><p>${isArchived ? '喝完归档的豆子会出现在这里' : '点击下方 + 拍照建档'}</p></div>`;
    return;
  }
  const cards = await Promise.all(beans.map(async (b) => {
    const st = statusOf(b);
    const remain = Number(b.remainingWeight) || 0;
    const total = Number(b.totalWeight) || 1;
    const pct = Math.max(0, Math.min(100, Math.round((remain / total) * 100)));
    const url = await photoURL(b);
    const badge = st.key === 'resting'
      ? `养豆中 · 还差 ${st.daysToReady} 天`
      : st.key === 'finished' ? '已喝完' : st.label;
    return `
    <a class="bean-card" href="#/bean/${b.id}">
      ${url ? `<img class="bean-thumb" src="${url}" alt="" loading="lazy"/>`
            : `<img class="bean-thumb" src="icons/icon-192.png" alt="" loading="lazy"/>`}
      <div class="bean-main">
        <div class="bean-name">${esc(b.name || '未命名')}</div>
        <div class="bean-roaster">${esc([b.roaster, b.origin].filter(Boolean).join(' · ') || '—')}</div>
        <div class="bean-meta">
          <span class="badge ${st.cls}">${badge}</span>
          <div class="bean-progress ${pct <= 20 ? 'low' : ''}"><i style="width:${pct}%"></i></div>
        </div>
      </div>
      <div class="bean-side">
        <div class="bean-grams">${fmtG(Math.max(remain, 0))}<small>g</small></div>
        <div class="bean-pct">剩 ${pct}%</div>
      </div>
    </a>`;
  }));
  list.innerHTML = cards.join('');

  /* 长按 / 左滑 删除手势 */
  list.querySelectorAll('.bean-card').forEach((card, idx) => attachDelete(card, beans[idx]));
}

/* ---------------- 删除手势：长按（含右键）或左滑超过 64px ---------------- */
function attachDelete(card, bean) {
  let lpTimer = null, longFired = false, asking = false;
  let sx = 0, sy = 0, dx = 0, swiping = false;

  async function requestDelete() {
    if (asking) return;
    asking = true;
    const yes = await confirmBox(`删除「${bean.name || '未命名'}」？`, '档案、冲煮流水与照片都会一并清除，无法恢复', { okText: '删除', danger: true });
    asking = false;
    if (!yes) { card.style.transform = ''; return; }
    await deleteBeanDeep(bean);
    vibrate(15);
    toast('已删除');
    render(document.getElementById('view'));
  }

  card.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; dx = 0;
    longFired = false; swiping = false;
    lpTimer = setTimeout(() => { longFired = true; vibrate(25); requestDelete(); }, 500);
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(lpTimer);
    if (dx < -8 && Math.abs(dx) > Math.abs(dy)) {
      swiping = true;
      card.classList.add('swiping');
      card.style.transition = 'none';
      card.style.transform = `translateX(${Math.max(dx, -96)}px)`;
    }
  }, { passive: true });

  const end = () => {
    clearTimeout(lpTimer);
    if (swiping) {
      card.style.transition = 'transform .25s ease';
      card.classList.remove('swiping');
      card.style.transform = '';
      if (dx < -64) { vibrate(20); requestDelete(); }
    }
  };
  card.addEventListener('touchend', end);
  card.addEventListener('touchcancel', end);

  /* 桌面右键 = 安卓 Chrome 长按，同样触发 */
  card.addEventListener('contextmenu', (e) => { e.preventDefault(); requestDelete(); });

  /* 手势发生后拦截本次点击导航 */
  card.addEventListener('click', (e) => {
    if (longFired || swiping) {
      e.preventDefault(); e.stopImmediatePropagation();
      longFired = false; swiping = false;
    }
  }, true);
}
