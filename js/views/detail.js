/* 鉴豆 · 豆子详情：档案 + 冲煮/修正 + 评分雷达 + 流水时间线 */
import { db, addTx, recalcBean, getBeanFull, deleteBeanDeep } from '../db.js';
import { exportTxCard } from '../card.js';
import { datePickerSheet } from '../datepick.js';
import { statusOf, avgRatings, RATING_DIMS, centerScore, fmtG, fmtCN, fmtDuration, parseDuration, daysBetween, todayStr, esc, uid } from '../util.js';
import { toast, vibrate, sheet, confirmBox, photoURL, viewImage } from '../ui.js';
import { radarChart } from '../charts.js';

export async function render(view, params) {
  if (!params || !params.id) { location.hash = '#/'; return; }
  const full = await getBeanFull(params.id);
  if (!full) {
    view.innerHTML = `<div class="empty"><div class="empty-art">🍂</div><h3>档案不存在</h3><p>可能已被删除</p></div>`;
    return;
  }
  await draw(view, full);
}

async function draw(view, full) {
  const { bean, txs } = full;
  const st = statusOf(bean);
  const url = await photoURL(bean);
  const remain = Number(bean.remainingWeight) || 0;
  const total = Number(bean.totalWeight) || 1;
  const pct = Math.max(0, Math.min(100, Math.round((remain / total) * 100)));
  const daysRoast = daysBetween(bean.roastDate, todayStr());
  const avg = avgRatings(txs);

  /* 养豆进度文案 */
  let restLine = '';
  if (st.key === 'resting') {
    restLine = `养豆第 ${st.daysSince + 1} 天 / 共 ${bean.restDays} 天，还差 <b>${st.daysToReady}</b> 天开喝`;
  } else if (st.key === 'ready') {
    restLine = `已养好 ${Math.max(0, (daysRoast ?? bean.restDays) - bean.restDays)} 天 · 建议适饮期内喝完`;
  } else if (st.key === 'aging') {
    restLine = `烘焙后已 ${daysRoast} 天，风味正在衰退`;
  } else {
    restLine = '这包豆子已喝完，归档后可随时回看';
  }
  const restPct = st.key === 'resting'
    ? Math.min(100, Math.round(((st.daysSince + 1) / bean.restDays) * 100))
    : 100;

  view.innerHTML = `
    <div class="hero">
      ${url
        ? `<img class="hero-photo" id="hero-photo" src="${url}" alt="包装照片"/>`
        : `<img class="hero-photo" src="icons/icon-maskable-512.png" alt=""/>`}
      <div class="hero-name">${esc(bean.name || '未命名')}</div>
      <div class="hero-sub">${esc([bean.roaster, bean.origin].filter(Boolean).join(' · ') || '补充烘焙商与产地信息')}</div>
      <div class="chips">
        ${bean.estate ? `<span class="chip">庄园<b>${esc(bean.estate)}</b></span>` : ''}
        ${bean.variety ? `<span class="chip">豆种<b>${esc(bean.variety)}</b></span>` : ''}
        ${bean.process ? `<span class="chip">处理法<b>${esc(bean.process)}</b></span>` : ''}
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:center;margin-bottom:12px;">
        <span class="badge ${st.cls}" style="font-size:12.5px;padding:4px 14px;">
          ${st.key === 'resting' ? `养豆中 · 还差 ${st.daysToReady} 天` : st.label}
        </span>
      </div>
      <div class="remain-wrap">
        <div class="remain-num">${fmtG(Math.max(remain, 0))}<small> g 剩余</small></div>
        <div class="remain-bar"><i style="width:${pct}%"></i></div>
        <div class="remain-cap">总克重 ${fmtG(bean.totalWeight)} g · 剩 ${pct}%${bean.archived ? ' · 已归档' : ''}</div>
      </div>
      <div class="rest-track">
        <div class="bean-progress" style="height:5px;"><i style="width:${restPct}%;background:linear-gradient(90deg,#C99B6A,#96702F);"></i></div>
        <div class="rest-line"><span>烘焙 ${fmtCN(bean.roastDate) || '未填'}</span><span>${restLine}</span></div>
      </div>
    </div>

    ${bean.archived
      ? `<div class="act-row">
           <button class="act-btn" id="act-restore">↩️<span>恢复在喝</span></button>
           <button class="act-btn" id="act-edit">✏️<span>编辑</span></button>
           <button class="act-btn danger-act" id="act-del">🗑<span>删除</span></button>
         </div>`
      : `<div class="act-row" style="grid-template-columns:1fr 1fr;">
           <button class="act-btn" id="act-brew">☕<span>记一笔冲煮</span></button>
           <button class="act-btn" id="act-adjust">⚖️<span>修正克重</span></button>
         </div>
         <div style="display:flex;gap:9px;margin:4px 0 14px;">
           <button class="btn ghost sm" style="flex:1;" id="act-edit">编辑档案</button>
           <button class="btn ghost sm" style="flex:1;" id="act-archive">归档这包</button>
         </div>`}

    <div class="card">
      <div class="card-title">档案信息</div>
      <div class="kv"><span class="k">烘焙商</span><span class="v">${esc(bean.roaster || '—')}</span></div>
      <div class="kv"><span class="k">产地</span><span class="v">${esc(bean.origin || '—')}</span></div>
      <div class="kv"><span class="k">庄园 / 处理厂</span><span class="v">${esc(bean.estate || '—')}</span></div>
      <div class="kv"><span class="k">豆种</span><span class="v">${esc(bean.variety || '—')}</span></div>
      <div class="kv"><span class="k">处理法</span><span class="v">${esc(bean.process || '—')}</span></div>
      <div class="kv"><span class="k">烘焙日期</span><span class="v">${fmtCN(bean.roastDate) || '—'}${daysRoast != null ? `（第 ${daysRoast} 天）` : ''}</span></div>
      <div class="kv"><span class="k">养豆天数</span><span class="v">${bean.restDays} 天</span></div>
      ${bean.price != null ? `<div class="kv"><span class="k">总价</span><span class="v">¥${bean.price}${bean.totalWeight ? `（${(bean.price / bean.totalWeight * 1000).toFixed(0)} 元/kg）` : ''}</span></div>` : ''}
      ${bean.flavors ? `<div class="kv"><span class="k">风味</span><span class="v">${esc(bean.flavors)}</span></div>` : ''}
    </div>

    <div class="card">
      <div class="card-title">风味评分${avg ? `<b>${avg.overall} 分</b>` : ''}</div>
      ${avg
        ? radarChart(RATING_DIMS.map((d) => ({ label: d.label, value: avg[d.key] || 0 })))
        : `<div class="muted" style="padding:16px 0;">下次记录冲煮时顺手打个分，这里会生成你的风味雷达图 ☕</div>`}
    </div>

    <section class="tx-section">
      <div class="tx-section-title">流水记录</div>
      <div id="tx-list">${txListHtml(txs) || '<div class="muted" style="padding:14px 0;">还没有流水，冲煮或修正克重后会记录在这里</div>'}</div>
    </section>

    ${bean.archived ? '' : `<div class="mt-8"><button class="btn danger block sm" id="act-del-bottom" style="display:none;">删除</button></div>`}
  `;

  const $ = (s) => view.querySelector(s);

  /* 看大图（无真实照片时不放大占位图标） */
  $('#hero-photo')?.addEventListener('click', () => { if (url) viewImage(url); });

  /* 冲煮 */
  $('#act-brew')?.addEventListener('click', () => brewSheet(bean));
  /* 修正 */
  $('#act-adjust')?.addEventListener('click', () => adjustSheet(bean));
  /* 编辑 */
  $('#act-edit')?.addEventListener('click', () => { location.hash = '#/add/' + bean.id; });
  /* 删除 */
  const del = async () => {
    const yes = await confirmBox('删除这份档案？', '档案、流水与照片都会清除，无法恢复', { okText: '删除', danger: true });
    if (!yes) return;
    await deleteBeanDeep(bean);
    toast('已删除');
    location.hash = '#/';
  };
  $('#act-del')?.addEventListener('click', del);
  /* 下滑时顶栏标题换成「烘焙商 · 豆子名称」，回滚恢复 */
  if (view._jdTitleScroll) view.removeEventListener('scroll', view._jdTitleScroll);
  const titleEl = document.getElementById('page-title');
  const scrolledTitle = [bean.roaster, bean.name].filter(Boolean).join(' · ') || bean.name || '豆子档案';
  view._jdTitleScroll = () => {
    if (location.hash.includes('#/bean/')) {
      titleEl.textContent = view.scrollTop > 150 ? scrolledTitle : '豆子档案';
    }
  };
  view.addEventListener('scroll', view._jdTitleScroll, { passive: true });

  /* 编辑历史流水 */
  view.querySelectorAll('.tx-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tx = txs.find((t) => t.id === btn.dataset.id);
      if (!tx) return;
      if (tx.type === 'brew') brewSheet(bean, tx);
      else if (tx.type === 'share') adjustSheet(bean, tx);  /* 分豆入口已移除，历史分豆记录归入修正编辑 */
      else adjustSheet(bean, tx);
    });
  });

  /* 单笔流水生成分享卡片（存相册/下载） */
  view.querySelectorAll('.tx-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tx = txs.find((t) => t.id === btn.dataset.id);
      if (tx) exportTxCard(bean, tx);
    });
  });

  /* 归档 / 恢复 */
  $('#act-archive')?.addEventListener('click', async () => {
    const yes = await confirmBox('归档这包豆子？', '归档后从「在喝」列表移除，档案与流水保留，随时可恢复');
    if (!yes) return;
    bean.archived = true; bean.archivedAt = Date.now();
    await db.beans.put(bean);
    toast('已归档');
    draw(view, await getBeanFull(bean.id));
  });
  $('#act-restore')?.addEventListener('click', async () => {
    bean.archived = false; bean.archivedAt = null;
    await db.beans.put(bean);
    toast('已恢复在喝');
    draw(view, await getBeanFull(bean.id));
  });

  /* 若 App 在冲煮弹层打开时被系统重载，回到详情后自动续写。 */
  if (!bean.archived) {
    const pending = activeBrewDraft(bean.id, txs);
    if (pending) requestAnimationFrame(() => {
      if (!document.querySelector('.sheet')) brewSheet(bean, pending.editTx);
    });
  }
}

/* ---------------- 流水列表 ---------------- */
/* 冲煮参数与器具汇总成一行小字：92°C · 1:15 · 270g 水 · 2'30" · C40 24格 · V60 */
function metaOf(t) {
  const meta = [];
  if (t.params) {
    if (t.params.temp != null) meta.push(t.params.temp + '°C');
    if (t.params.ratio) meta.push('1:' + t.params.ratio);
    if (t.params.water != null) meta.push(fmtG(t.params.water) + 'g 水');
    if (t.params.bypass != null && t.params.bypass > 0) meta.push('bypass ' + fmtG(t.params.bypass) + 'g');
    if (t.params.duration != null) meta.push(fmtDuration(t.params.duration));
    if (t.params.grind) meta.push(t.params.grind);
  }
  if (t.equip) for (const v of Object.values(t.equip)) if (v) meta.push(v);
  return meta.join(' · ');
}

function txListHtml(txs) {
  if (!txs.length) return '';
  const META = {
    brew:  { ic: '☕', name: '冲煮', cls: 'brew' },
    share: { ic: '🎁', name: '分豆出库', cls: 'share' },
    adjust:{ ic: '⚖️', name: '修正', cls: 'adjust' },
  };
  return txs.map((t) => {
    const m = META[t.type] || META.adjust;
    const neg = t.type !== 'adjust' || t.grams < 0;
    const g = t.type === 'adjust' ? (t.grams > 0 ? `+${fmtG(t.grams)}` : fmtG(t.grams)) : `-${fmtG(t.grams)}`;
    const ratingHtml = t.rating ? `
      <div class="tx-rating">
        ${RATING_DIMS.filter((d) => t.rating[d.key] != null && t.rating[d.key] !== '')
          .map((d) => `<span class="rate-tag">${d.label} <b>${d.special ? centerScore(t.rating[d.key]) : t.rating[d.key]}</b></span>`).join('')}
      </div>` : '';
    return `
    <div class="tx-item">
      <div class="tx-ic ${m.cls}">${m.ic}</div>
      <div class="tx-main">
        <div class="tx-top">
          <span class="tx-type">${m.name}</span>
          <span class="tx-grams ${neg ? 'neg' : 'pos'}">${g} g</span>
        </div>
        <div class="tx-date">${t.date}</div>
        ${metaOf(t) ? `<div class="tx-meta">${esc(metaOf(t))}</div>` : ''}
        ${t.note ? `<div class="tx-note">${esc(t.note)}</div>` : ''}
        ${ratingHtml}
      </div>
      <div class="tx-acts">
        <button class="tx-edit" data-id="${t.id}" aria-label="编辑此记录" title="编辑">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.1L19 9.1a2.1 2.1 0 0 0 0-3L17.9 5a2.1 2.1 0 0 0-3 0L4 15.9V20Z"/><path d="m13.8 6.2 4 4"/></svg>
        </button>
        <button class="tx-card" data-id="${t.id}" aria-label="保存流水图片" title="保存图片">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M5 18v2h14v-2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

/* ---------------- 冲煮弹层（器具 + 参数 + 评分） ---------------- */
const EQUIP_CATS = [
  { key: 'kettle',  label: '壶' },
  { key: 'dripper', label: '滤杯' },
  { key: 'paper',   label: '滤纸' },
  { key: 'grinder', label: '磨豆机' },
];

/* 未完成冲煮草稿：按豆子+记录隔离，保留 7 天。 */
const BREW_DRAFT_PREFIX = 'jiandou-brew-draft:';
const BREW_DRAFT_TTL = 7 * 86400000;
const brewDraftKey = (beanId, editTx = null) => `${BREW_DRAFT_PREFIX}${beanId}:${editTx ? editTx.id : 'new'}`;

function readBrewDraft(key) {
  try {
    const draft = JSON.parse(localStorage.getItem(key) || 'null');
    if (!draft || Date.now() - Number(draft.savedAt || 0) > BREW_DRAFT_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch (_) { return null; }
}

function activeBrewDraft(beanId, txs) {
  const prefix = `${BREW_DRAFT_PREFIX}${beanId}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const draft = readBrewDraft(key);
    if (!draft?.active) continue;
    const editTx = draft.editTxId ? txs.find((t) => t.id === draft.editTxId && t.type === 'brew') : null;
    if (!draft.editTxId || editTx) return { draft, editTx };
  }
  return null;
}

/* 只允许从圆点附近起手拖动；点横轴、轻触不改分，也不获取输入焦点。 */
function wireDragOnlyRange(range, onValue) {
  let dragging = false;
  const position = (clientX) => {
    const rect = range.getBoundingClientRect();
    const min = Number(range.min), max = Number(range.max), step = Number(range.step) || 1;
    const left = rect.left + 11, width = Math.max(1, rect.width - 22);
    const raw = min + Math.max(0, Math.min(1, (clientX - left) / width)) * (max - min);
    return Math.max(min, Math.min(max, Math.round(raw / step) * step));
  };
  range.tabIndex = -1;
  range.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    document.activeElement?.blur?.();
    const rect = range.getBoundingClientRect();
    const min = Number(range.min), max = Number(range.max);
    const thumbX = rect.left + 11 + ((Number(range.value) - min) / (max - min)) * Math.max(1, rect.width - 22);
    if (Math.abs(e.clientX - thumbX) > 26) return;
    dragging = true;
    range.setPointerCapture?.(e.pointerId);
  });
  range.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const next = position(e.clientX);
    if (Number(range.value) !== next) { range.value = String(next); onValue(); }
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    range.releasePointerCapture?.(e.pointerId);
    range.blur();
  };
  range.addEventListener('pointerup', end);
  range.addEventListener('pointercancel', end);
  range.addEventListener('click', (e) => e.preventDefault());
  range.addEventListener('keydown', (e) => e.preventDefault());
}

/* 弹层里新增一件器具（保存后自动选用） */
function promptNewEquip(catLabel) {
  return new Promise((resolve) => {
    let settled = false;
    sheet({
      title: `＋ 新增${catLabel}`,
      html: `
        <div class="field" style="margin:0;">
          <label>名称</label>
          <input type="text" id="ne-name" maxlength="24" placeholder="如 ${catLabel === '磨豆机' ? 'Comandante C40' : catLabel + '的名字'}"/>
        </div>
        <button class="btn primary block" id="ne-save" style="margin-top:14px;">保存并选用</button>`,
      onMount(el, close) {
        const input = el.querySelector('#ne-name');
        input.focus();
        el.querySelector('#ne-save').onclick = () => {
          const v = input.value.trim();
          if (!v) { toast('请输入名称', 'err'); return; }
          settled = true;
          close();
          resolve(v);
        };
      },
      onClose: () => { if (!settled) resolve(null); },
    });
  });
}

async function brewSheet(bean, editTx = null) {
  const items = await db.equip.all();
  const lastEquip = (await db.settings.get('lastEquip', {})) || {};
  const lastParams = (await db.settings.get('lastParams', {})) || {};
  const draftKey = brewDraftKey(bean.id, editTx);
  const draft = readBrewDraft(draftKey);
  let saveDraftNow = () => {};
  let cleanupDraft = () => {};
  let draftCommitted = false;
  const P = editTx && editTx.params ? editTx.params : null;
  const durStr = P && P.duration != null
    ? (Math.floor(P.duration / 60) ? `${Math.floor(P.duration / 60)}:${String(P.duration % 60).padStart(2, '0')}` : String(P.duration))
    : '';

  const html = `
    <div class="quick-row">
      <button class="quick-pill" data-g="10">10g</button>
      <button class="quick-pill" data-g="12">12g</button>
      <button class="quick-pill" data-g="15">15g</button>
    </div>
    <div class="field-row">
      <div class="field"><label>克数（g）*</label>
        <input type="number" id="brew-g" inputmode="decimal" min="0.1" step="0.1" value="${editTx ? editTx.grams : 15}"/></div>
      <div class="field"><label>日期</label>
        <input type="text" id="brew-date" readonly value="${editTx ? editTx.date : todayStr()}" style="cursor:pointer;"/></div>
    </div>

    <div class="field-row">
      <div class="field"><label>水温 ℃</label>
        <input type="number" id="brew-temp" inputmode="decimal" min="0" max="100" step="0.5" value="${P ? (P.temp ?? 93) : (lastParams.temp ?? 93)}"/></div>
      <div class="field"><label>粉水比</label>
        <select id="brew-ratio">
          ${[13, 14, 15, 16, 17].map((r) => `<option value="${r}"${Number(P ? (P.ratio ?? 16) : (lastParams.ratio ?? 16)) === r ? ' selected' : ''}>1:${r}</option>`).join('')}
        </select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>水量 g（自动按比例）</label>
        <input type="number" id="brew-water" inputmode="decimal" min="0" step="1" value="${P && P.water != null ? P.water : ''}"/></div>
      <div class="field"><label>冲煮时长</label>
        <input type="text" id="brew-dur" placeholder="如 2:30 或 150" maxlength="8" value="${durStr}"/></div>
    </div>
    <div class="field-row">
      <div class="field"><label>研磨度</label>
        <input type="text" id="brew-grind" placeholder="如 C40 24格" maxlength="20" value="${P ? (P.grind || '') : esc(lastParams.grind || '')}"/></div>
      <div class="field"><label>Bypass 加水 g（选填）</label>
        <input type="number" id="brew-bypass" inputmode="decimal" min="0" step="1" placeholder="浓了加多少水稀释" value="${P && P.bypass != null ? P.bypass : (lastParams.bypass != null ? lastParams.bypass : '')}"/></div>
    </div>

    <div class="field-row">
      <div class="field"><label>壶</label><select data-cat="kettle"></select></div>
      <div class="field"><label>滤杯</label><select data-cat="dripper"></select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>滤纸</label><select data-cat="paper"></select></div>
      <div class="field"><label>磨豆机</label><select data-cat="grinder"></select></div>
    </div>

    <div class="field"><label>这一杯的感受（选填）</label>
      <textarea id="brew-note" maxlength="200" placeholder="香气、口感、和上一次的对比…想说多少写多少">${esc(editTx ? (editTx.note || '') : '')}</textarea></div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin:6px 0 4px;">
      <span style="font-size:13.5px;color:var(--ink-2);">顺手打个分？</span>
      <label class="switch"><input type="checkbox" id="brew-rate-on"/><span class="tr"></span></label>
    </div>
    <div id="brew-rates" hidden>
      ${RATING_DIMS.map((d) => `
        <div class="rate-row">
          <div class="rate-head">
            <span class="rate-label">${d.label}${d.special ? ' <small style="color:var(--ink-3);font-weight:400;font-size:11px;">5 = 平衡满分</small>' : ''}</span>
            <span class="rate-val" id="rv-${d.key}">${d.special ? '5 → 10分' : '7.0'}</span>
          </div>
          <input type="range" class="rate" min="0" max="10" step="0.5" value="${d.special ? 5 : 7}" data-k="${d.key}"${d.special ? ' data-special="1"' : ''} inputmode="none" autocomplete="off"/>
        </div>`).join('')}
      <div class="muted" style="text-align:left;margin-bottom:10px;">花香/果香/甜感/余韵：越高越好，0 = 不适用 · 酸质与 Body 记强度感受，5 为完美平衡，偏离扣分 · 整体自动算平均</div>
    </div>

    <div class="sheet-save-bar"><button class="btn primary block" id="brew-save">记录冲煮</button></div>`;

  sheet({
    title: editTx ? '✎ 编辑冲煮' : `☕ ${bean.name || '冲煮'}`,
    html,
    onClose() {
      cleanupDraft();
      if (!draftCommitted) saveDraftNow(false);
    },
    async onMount(el, close) {
      const gEl = el.querySelector('#brew-g');
      const ratioSel = el.querySelector('#brew-ratio');
      const waterEl = el.querySelector('#brew-water');

      /* 冲煮日期：应用内日历 */
      const dateEl = el.querySelector('#brew-date');
      dateEl.addEventListener('click', async () => {
        const v = await datePickerSheet({ value: dateEl.value, title: '冲煮日期' });
        if (v) { dateEl.value = v; saveDraftNow(true, true); }
      });

      /* 水量自动按 粉量 × 粉水比 计算，手动改过或编辑回填则尊重手输 */
      let waterDirty = !!(P && P.water != null);
      const syncWater = () => {
        if (waterDirty) return;
        const g = parseFloat(gEl.value) || 0;
        waterEl.value = g ? Math.round(g * Number(ratioSel.value)) : '';
      };
      gEl.addEventListener('input', syncWater);
      ratioSel.addEventListener('change', syncWater);
      waterEl.addEventListener('input', () => { waterDirty = true; });
      syncWater();

      /* 器具下拉：默认★ > 上次使用 > 不记录；可现场新增 */
      const fillSelect = (sel, cat) => {
        const catItems = items.filter((i) => i.cat === cat)
          .sort((a, b) => ((b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
            || ((a.createdAt || 0) - (b.createdAt || 0))
            || String(a.id).localeCompare(String(b.id)));
        const def = catItems.find((i) => i.isDefault);
        const pre = (editTx && editTx.equip && editTx.equip[cat]) || (def && def.name) || lastEquip[cat] || '';
        sel.innerHTML = `<option value="">不记录</option>` +
          catItems.map((i) => `<option value="${esc(i.name)}">${esc(i.name)}</option>`).join('') +
          `<option value="__new__">＋ 新增…</option>`;
        sel.value = catItems.some((i) => i.name === pre) ? pre : '';
      };
      const selects = el.querySelectorAll('select[data-cat]');
      selects.forEach((sel) => {
        const cat = sel.dataset.cat;
        const catLabel = EQUIP_CATS.find((c) => c.key === cat).label;
        fillSelect(sel, cat);
        sel.addEventListener('change', async () => {
          if (sel.value !== '__new__') return;
          const name = await promptNewEquip(catLabel);
          if (name) {
            const item = { id: uid(), cat, name, isDefault: false, createdAt: Date.now() };
            items.push(item);
            await db.equip.put(item);
            fillSelect(sel, cat);
            sel.value = name;
            toast(`已添加${catLabel}「${name}」`, 'ok');
            saveDraftNow(true, true);
          } else {
            sel.value = '';
          }
        });
      });

      /* 快捷克数：高亮与当前克重保持一致（编辑回填时不误导） */
      const syncPills = () => {
        const cur = String(parseFloat(gEl.value) || '');
        el.querySelectorAll('.quick-pill').forEach((x) => x.classList.toggle('on', x.dataset.g === cur));
      };
      el.querySelectorAll('.quick-pill').forEach((p) => {
        p.onclick = () => {
          el.querySelectorAll('.quick-pill').forEach((x) => x.classList.toggle('on', x === p));
          gEl.value = p.dataset.g;
          syncWater();
          saveDraftNow(true, true);
        };
      });
      gEl.addEventListener('input', syncPills);
      syncPills();

      /* 评分开关（编辑时回填已有评分） */
      const on = el.querySelector('#brew-rate-on');
      on.onchange = () => { el.querySelector('#brew-rates').hidden = !on.checked; };
      const ranges = el.querySelectorAll('input[type="range"].rate');
      const paintRate = (r) => {
          const v = Number(r.value);
          el.querySelector('#rv-' + r.dataset.k).textContent = r.dataset.special ? `${v} → ${centerScore(v)}分` : v.toFixed(1);
      };
      ranges.forEach((r) => wireDragOnlyRange(r, () => { paintRate(r); saveDraftNow(true, true); }));
      if (editTx && editTx.rating) {
        on.checked = true;
        el.querySelector('#brew-rates').hidden = false;
        ranges.forEach((r) => {
          const v = editTx.rating[r.dataset.k];
          if (v != null) { r.value = v; paintRate(r); }
        });
      }

      /* 恢复同一豆子/同一记录的未完成草稿。 */
      let draftChanged = !!draft?.changed;
      if (draft?.fields) {
        const f = draft.fields;
        const values = {
          '#brew-g': f.g, '#brew-date': f.date, '#brew-temp': f.temp,
          '#brew-ratio': f.ratio, '#brew-water': f.water, '#brew-dur': f.duration,
          '#brew-grind': f.grind, '#brew-bypass': f.bypass, '#brew-note': f.note,
        };
        for (const [sel, value] of Object.entries(values)) {
          if (value != null && el.querySelector(sel)) el.querySelector(sel).value = value;
        }
        waterDirty = !!f.waterDirty;
        selects.forEach((sel) => {
          const value = f.equip?.[sel.dataset.cat];
          if (value != null && [...sel.options].some((o) => o.value === value)) sel.value = value;
        });
        on.checked = !!f.ratingOn;
        el.querySelector('#brew-rates').hidden = !on.checked;
        ranges.forEach((r) => {
          if (f.ratings?.[r.dataset.k] != null) r.value = f.ratings[r.dataset.k];
          paintRate(r);
        });
        syncPills();
        if (draftChanged) toast('已恢复上次未完成的冲煮记录', 'ok');
      }

      let draftTimer = 0;
      const collectDraft = (active) => {
        const equip = {};
        selects.forEach((s) => { if (s.value && s.value !== '__new__') equip[s.dataset.cat] = s.value; });
        const ratings = {};
        ranges.forEach((r) => { ratings[r.dataset.k] = Number(r.value); });
        return {
          ver: 1, savedAt: Date.now(), active, changed: draftChanged,
          beanId: bean.id, editTxId: editTx?.id || null,
          fields: {
            g: gEl.value, date: dateEl.value, temp: el.querySelector('#brew-temp').value,
            ratio: ratioSel.value, water: waterEl.value, duration: el.querySelector('#brew-dur').value,
            grind: el.querySelector('#brew-grind').value, bypass: el.querySelector('#brew-bypass').value,
            note: el.querySelector('#brew-note').value, equip, waterDirty,
            ratingOn: on.checked, ratings,
          },
        };
      };
      saveDraftNow = (active = true, markChanged = false) => {
        clearTimeout(draftTimer);
        if (markChanged) draftChanged = true;
        if (!active && !draftChanged) { localStorage.removeItem(draftKey); return; }
        try { localStorage.setItem(draftKey, JSON.stringify(collectDraft(active))); } catch (_) {}
      };
      const scheduleDraft = () => {
        draftChanged = true;
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => saveDraftNow(true), 120);
      };
      el.querySelectorAll('input:not([type="range"]), textarea, select').forEach((field) => {
        field.addEventListener('input', scheduleDraft);
        field.addEventListener('change', scheduleDraft);
      });
      const saveOnHide = () => { if (document.hidden) saveDraftNow(true); };
      const saveOnPageHide = () => saveDraftNow(true);
      document.addEventListener('visibilitychange', saveOnHide);
      window.addEventListener('pagehide', saveOnPageHide);
      cleanupDraft = () => {
        clearTimeout(draftTimer);
        document.removeEventListener('visibilitychange', saveOnHide);
        window.removeEventListener('pagehide', saveOnPageHide);
      };
      /* 标记弹层正在填写；若系统此刻回收页面，详情页会自动重开。 */
      saveDraftNow(true);

      /* 保存 */
      el.querySelector('#brew-save').onclick = async () => {
        const g = parseFloat(gEl.value);
        if (!(g > 0)) { toast('请输入有效克数', 'err'); return; }

        const equip = {};
        selects.forEach((s) => { if (s.value && s.value !== '__new__') equip[s.dataset.cat] = s.value; });
        const params = {
          temp: parseFloat(el.querySelector('#brew-temp').value) || null,
          water: parseFloat(waterEl.value) || null,
          ratio: Number(ratioSel.value),
          grind: el.querySelector('#brew-grind').value.trim(),
          duration: parseDuration(el.querySelector('#brew-dur').value),
          bypass: parseFloat(el.querySelector('#brew-bypass').value) || null,
        };

        const rating = on.checked ? {} : null;
        if (on.checked) {
          el.querySelectorAll('input[type="range"].rate').forEach((r) => { rating[r.dataset.k] = Number(r.value); });
        }

        const date = el.querySelector('#brew-date').value || todayStr();
        const note = el.querySelector('#brew-note').value.trim();

        /* 编辑：更新原记录并重算剩余克重 */
        if (editTx) {
          Object.assign(editTx, { grams: g, date, note, rating, equip, params });
          await db.txs.put(editTx);
          await recalcBean(bean);
          draftCommitted = true; cleanupDraft(); localStorage.removeItem(draftKey);
          vibrate(10);
          toast('冲煮记录已更新 ✎', 'ok');
          close();
          rerender();
          return;
        }

        if (g > (Number(bean.remainingWeight) || 0)) toast('注意：本次克数超过了剩余克重', 'err');

        await db.settings.set('lastEquip', equip);
        await db.settings.set('lastParams', params);

        const { bean: nb } = await addTx(bean.id, {
          type: 'brew', grams: g,
          date, note, rating, equip, params,
        });
        draftCommitted = true; cleanupDraft(); localStorage.removeItem(draftKey);
        vibrate(10);
        toast((Number(nb.remainingWeight) || 0) <= 0
          ? `冲煮 ${fmtG(g)}g 已记录，这包喝完了 → 自动归档 📦`
          : `冲煮 ${fmtG(g)}g 已记录 ☕`, 'ok');
        close();
        rerender();
      };
    },
  });
}

/* ---------------- 修正弹层（支持编辑历史修正） ---------------- */
function adjustSheet(bean, editTx = null) {
  const html = `
    ${editTx
      ? `<div class="muted" style="text-align:center;margin-bottom:14px;">修改这笔修正记录的克重变化、日期或备注</div>`
      : `<div class="muted" style="text-align:center;margin-bottom:14px;">当前剩余 <b style="color:var(--ink);font-family:var(--num);font-size:16px;">${fmtG(bean.remainingWeight)} g</b> · 称重后填入实际值</div>`}
    <div class="field"><label>${editTx ? '克重变化（g，可正可负）*' : '实际剩余克重（g）*'}</label>
      <input type="number" id="adj-g" inputmode="decimal" ${editTx ? '' : 'min="0"'} max="10000" step="0.1" value="${editTx ? editTx.grams : bean.remainingWeight}"/></div>
    <div class="field"><label>日期</label>
      <input type="text" id="adj-date" readonly value="${editTx ? editTx.date : todayStr()}" style="cursor:pointer;"/></div>
    <div class="field"><label>备注（选填）</label>
      <input type="text" id="adj-note" placeholder="如：称重校准" maxlength="40" value="${esc(editTx ? (editTx.note || '') : '')}"/></div>
    <button class="btn primary block" id="adj-save">${editTx ? '保存修改' : '保存修正'}</button>`;

  sheet({
    title: editTx ? '✎ 编辑修正' : '⚖️ 修正克重',
    html,
    onMount(el, close) {
      const dateEl = el.querySelector('#adj-date');
      dateEl.addEventListener('click', async () => {
        const v = await datePickerSheet({ value: dateEl.value, title: '修正日期' });
        if (v) dateEl.value = v;
      });
      el.querySelector('#adj-save').onclick = async () => {
        const val = parseFloat(el.querySelector('#adj-g').value);
        const date = dateEl.value || todayStr();
        const note = el.querySelector('#adj-note').value.trim();

        if (editTx) {
          if (isNaN(val)) { toast('请输入有效克数', 'err'); return; }
          Object.assign(editTx, { grams: val, date, note: note || (val > 0 ? '补入' : '修正') });
          await db.txs.put(editTx);
          await recalcBean(bean);
          toast('修正记录已更新 ✎', 'ok');
          close();
          rerender();
          return;
        }
        if (isNaN(val) || val < 0) { toast('请输入有效克数', 'err'); return; }
        const delta = Math.round((val - (Number(bean.remainingWeight) || 0)) * 10) / 10;
        if (delta === 0) { toast('克重没有变化'); close(); return; }
        const { bean: nb } = await addTx(bean.id, {
          type: 'adjust', grams: delta,
          date,
          note: note || (delta > 0 ? '补入' : '修正'),
        });
        toast((Number(nb.remainingWeight) || 0) <= 0
          ? `已修正为 ${fmtG(val)}g，喝完自动归档 📦`
          : `已修正为 ${fmtG(val)}g`, 'ok');
        close();
        rerender();
      };
    },
  });
}

/* 当前详情页重绘 */
function rerender() {
  const view = document.getElementById('view');
  const id = location.hash.split('/').pop();
  getBeanFull(id).then((full) => { if (full) draw(view, full); });
}
