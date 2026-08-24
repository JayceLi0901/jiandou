/* 鉴豆 · 豆仓（首页）：今日开喝横幅 + 豆子卡片列表 + 归档；长按/左滑删除 */
import { db, deleteBeanDeep } from '../db.js';
import { bannerBeans, sortBeans, statusOf, fmtG, esc } from '../util.js';
import { photoURL, toast, vibrate, confirmBox, beanMark } from '../ui.js';
import { readMirror, restoreFromMirror, exportBackup } from '../backup.js';

export async function render(view) {
  const beans = await db.beans.all();
  /* 兼容旧数据/导入数据：只要余量已是 0，就不再留在「在喝」。 */
  const emptyActive = beans.filter((b) => !b.archived && (Number(b.remainingWeight) || 0) <= 0);
  if (emptyActive.length) {
    const archivedAt = Date.now();
    await Promise.all(emptyActive.map((b) => {
      b.archived = true;
      b.archivedAt = archivedAt;
      b.updatedAt = archivedAt;
      return db.beans.put(b);
    }));
  }
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
      <div class="banner-title">${todayN ? '🎉 今天开喝' : `${beanMark(22)}<span>已养好，等你开喝</span>`}</div>
      <div class="banner-beans">${bn.slice(0, 4).map((b) => `<span class="banner-chip">${esc(b.name || '未命名')}</span>`).join('')}${bn.length > 4 ? `<span class="banner-chip">等 ${bn.length} 包</span>` : ''}</div>
    </a>`;
  }

  /* 每月备份横幅：本月还没导出过备份就提醒（点击下载，落在下载目录，清浏览器数据删不掉） */
  const lastBackupAt = await db.settings.get('lastBackupAt', null);
  const monthNow = new Date().toISOString().slice(0, 7);
  const backedThisMonth = lastBackupAt && new Date(lastBackupAt).toISOString().slice(0, 7) === monthNow;
  if (beans.length && !backedThisMonth) {
    html += `
    <a class="banner" id="backup-banner" style="display:block;cursor:pointer;background:linear-gradient(140deg,#8B6B4A,#5C4426);">
      <div class="banner-title">📋 本月还没备份</div>
      <div class="banner-beans"><span class="banner-chip">点一下，把 ${beans.length} 份档案存到下载目录</span></div>
    </a>`;
  }

  /* 无豆子空状态（若镜像保险箱有数据，提示一键恢复） */
  if (!beans.length) {
    const mirror = readMirror();
    const mirrorBanner = mirror && mirror.beans && mirror.beans.length ? `
      <a class="banner" id="mirror-banner" style="display:block;cursor:pointer;">
        <div class="banner-title">🛟 发现本地镜像数据</div>
        <div class="banner-beans"><span class="banner-chip">${mirror.beans.length} 份档案 · ${(mirror.txs || []).length} 笔流水，点击立即恢复</span></div>
      </a>` : '';
    view.innerHTML = html + mirrorBanner + `
      <div class="empty">
        <div class="empty-art">${beanMark(88)}</div>
        <h3>豆仓空空如也</h3>
        <p>拍一张包装袋照片，开始第一份豆子档案</p>
        <div class="mt-14"><a class="btn primary" href="#/add">拍照建档</a></div>
      </div>`;
    view.querySelector('#mirror-banner')?.addEventListener('click', (e) => {
      e.preventDefault();
      restoreFromMirror();
    });
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
  view.querySelector('#backup-banner')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportBackup().then(() => render(view));
  });
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
    <div class="bean-wrap">
      <button class="card-del" aria-label="删除">删除</button>
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
      </a>
    </div>`;
  }));
  list.innerHTML = cards.join('');

  /* 左滑露出删除按钮 / 长按直接删 */
  list.querySelectorAll('.bean-wrap').forEach((wrap, idx) => attachCard(wrap, beans[idx]));
}

/* ---------------- 卡片手势：左滑露出「删除」按钮，点击按钮确认删除 ---------------- */
let openWrap = null;

function setOpen(wrap, open) {
  const card = wrap.querySelector('.bean-card');
  card.style.transition = 'transform .32s cubic-bezier(.34,1.3,.5,1), box-shadow .3s ease';
  /* 展开时豆子微微抬起、放大、倾斜 —— 从栏里「分离」出来的泡泡感 */
  card.style.transform = open ? 'translateX(-78px) translateY(-3px) scale(1.045) rotate(-0.6deg)' : '';
  card.classList.toggle('lifted', open);
}

function closeOpenWrap() {
  if (openWrap) { setOpen(openWrap, false); openWrap = null; }
}

function attachCard(wrap, bean) {
  const card = wrap.querySelector('.bean-card');
  const delBtn = wrap.querySelector('.card-del');
  let sx = 0, sy = 0, base = 0, dx = 0;
  let swiping = false, longFired = false, lpTimer = null, asking = false;

  async function requestDelete() {
    if (asking) return;
    asking = true;
    const yes = await confirmBox(`删除「${bean.name || '未命名'}」？`, '档案、冲煮流水与照片都会一并清除，无法恢复', { okText: '删除', danger: true });
    asking = false;
    if (!yes) { closeOpenWrap(); return; }
    /* 泡泡上浮消散动画，再真正删除 */
    vibrate(15);
    card.classList.remove('lifted');
    card.classList.add('bubble-out');
    setTimeout(async () => {
      await deleteBeanDeep(bean);
      toast('已删除');
      render(document.getElementById('view'));
    }, 430);
  }

  delBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    vibrate(12);
    requestDelete();
  });

  card.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; dx = 0;
    base = openWrap === wrap ? -80 : 0;
    swiping = false; longFired = false;
    lpTimer = setTimeout(() => { longFired = true; vibrate(25); requestDelete(); }, 500);
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(lpTimer);
    if (Math.abs(dx) > Math.abs(dy) && (dx < 0 || base < 0)) {
      swiping = true;
      card.classList.add('lifted');
      card.style.transition = 'none';
      const off = Math.min(0, Math.max(-84, base + dx));
      const lift = Math.min(1, -off / 80);
      card.style.transform = `translateX(${off}px) translateY(${-3 * lift}px) scale(${1 + 0.045 * lift}) rotate(${-0.6 * lift}deg)`;
    }
  }, { passive: true });

  const end = () => {
    clearTimeout(lpTimer);
    if (swiping) {
      const open = base + dx < -40;
      if (open) {
        if (openWrap && openWrap !== wrap) closeOpenWrap();
        openWrap = wrap;
        setOpen(wrap, true);
        vibrate(8);
      } else {
        if (openWrap === wrap) openWrap = null;
        setOpen(wrap, false);
      }
    }
    swiping = false;
  };
  card.addEventListener('touchend', end);
  card.addEventListener('touchcancel', end);

  /* 桌面右键 = 安卓长按，直接确认删除 */
  card.addEventListener('contextmenu', (e) => { e.preventDefault(); requestDelete(); });

  /* 展开状态点卡片 = 收起不跳转；手势后拦截导航 */
  card.addEventListener('click', (e) => {
    if (longFired || swiping || openWrap === wrap) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (openWrap === wrap) closeOpenWrap();
      longFired = false; swiping = false;
    }
  }, true);
}
