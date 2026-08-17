/* 鉴豆 · 豆子详情：档案 + 冲煮/分豆/修正 + 评分雷达 + 流水时间线 */
import { db, addTx, getBeanFull, deleteBeanDeep } from '../db.js';
import { statusOf, avgRatings, RATING_DIMS, fmtG, fmtCN, daysBetween, todayStr, esc } from '../util.js';
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
        : `<div class="hero-photo empty" style="margin:0 auto;">无照片</div>`}
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
      : `<div class="act-row">
           <button class="act-btn" id="act-brew">☕<span>记一笔冲煮</span></button>
           <button class="act-btn" id="act-share">🎁<span>分豆给咖友</span></button>
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
      ${bean.flavors ? `<div class="kv"><span class="k">风味</span><span class="v">${esc(bean.flavors)}</span></div>` : ''}
    </div>

    <div class="card">
      <div class="card-title">风味评分${avg ? `<b>${avg.overall} 分</b>` : ''}</div>
      ${avg
        ? radarChart(RATING_DIMS.map((d) => ({ label: d.label, value: avg[d.key] || 0 })))
        : `<div class="muted" style="padding:16px 0;">下次记录冲煮时顺手打个分，这里会生成你的风味雷达图 ☕</div>`}
    </div>

    <div class="card">
      <div class="card-title">流水记录<b>${txs.length} 笔</b></div>
      <div id="tx-list">${txListHtml(txs) || '<div class="muted" style="padding:14px 0;">还没有流水，冲煮或分豆后会记录在这里</div>'}</div>
    </div>

    ${bean.archived ? '' : `<div class="mt-8"><button class="btn danger block sm" id="act-del-bottom" style="display:none;">删除</button></div>`}
  `;

  const $ = (s) => view.querySelector(s);

  /* 看大图 */
  $('#hero-photo')?.addEventListener('click', () => viewImage(url));

  /* 冲煮 */
  $('#act-brew')?.addEventListener('click', () => brewSheet(bean));
  /* 分豆 */
  $('#act-share')?.addEventListener('click', () => shareSheet(bean));
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
}

/* ---------------- 流水列表 ---------------- */
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
          .map((d) => `<span class="rate-tag">${d.label} <b>${t.rating[d.key]}</b></span>`).join('')}
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
        ${t.note ? `<div class="tx-note">${esc(t.note)}</div>` : ''}
        ${ratingHtml}
      </div>
    </div>`;
  }).join('');
}

/* ---------------- 冲煮弹层 ---------------- */
function brewSheet(bean) {
  const html = `
    <div class="quick-row">
      <button class="quick-pill" data-g="15">15g</button>
      <button class="quick-pill" data-g="18">18g</button>
      <button class="quick-pill" data-g="20">20g</button>
    </div>
    <div class="field-row">
      <div class="field"><label>克数（g）*</label>
        <input type="number" id="brew-g" inputmode="decimal" min="0.1" step="0.1" value="15"/></div>
      <div class="field"><label>日期</label>
        <input type="date" id="brew-date" value="${todayStr()}" max="${todayStr()}"/></div>
    </div>
    <div class="field"><label>备注（选填）</label>
      <input type="text" id="brew-note" placeholder="如：V60 1:15，明天请朋友喝" maxlength="50"/></div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin:6px 0 4px;">
      <span style="font-size:13.5px;color:var(--ink-2);">顺手打个分？</span>
      <label class="switch"><input type="checkbox" id="brew-rate-on"/><span class="tr"></span></label>
    </div>
    <div id="brew-rates" hidden>
      ${RATING_DIMS.map((d, i) => `
        <div class="rate-row">
          <div class="rate-head"><span class="rate-label">${d.label}</span><span class="rate-val" id="rv-${d.key}">7.0</span></div>
          <input type="range" class="rate" min="0" max="10" step="0.5" value="7" data-k="${d.key}"/>
        </div>`).join('')}
      <div class="muted" style="text-align:left;margin-bottom:10px;">0 = 不适用 · 10 分制，按整体感受打</div>
    </div>

    <button class="btn primary block" id="brew-save">记录冲煮</button>`;

  sheet({
    title: `☕ ${bean.name || '冲煮'}`,
    html,
    onMount(el, close) {
      el.querySelectorAll('.quick-pill').forEach((p) => {
        p.onclick = () => {
          el.querySelectorAll('.quick-pill').forEach((x) => x.classList.toggle('on', x === p));
          el.querySelector('#brew-g').value = p.dataset.g;
        };
      });
      el.querySelector('.quick-pill').classList.add('on');
      const on = el.querySelector('#brew-rate-on');
      on.onchange = () => { el.querySelector('#brew-rates').hidden = !on.checked; };
      el.querySelectorAll('input[type="range"].rate').forEach((r) => {
        r.oninput = () => { el.querySelector('#rv-' + r.dataset.k).textContent = Number(r.value).toFixed(1); };
      });
      el.querySelector('#brew-save').onclick = async () => {
        const g = parseFloat(el.querySelector('#brew-g').value);
        if (!(g > 0)) { toast('请输入有效克数', 'err'); return; }
        const rating = on.checked ? {} : null;
        if (on.checked) {
          el.querySelectorAll('input[type="range"].rate').forEach((r) => { rating[r.dataset.k] = Number(r.value); });
        }
        const remainNow = Number(bean.remainingWeight) || 0;
        if (g > remainNow) toast('注意：本次克数超过了剩余克重', 'err');
        await addTx(bean.id, {
          type: 'brew', grams: g,
          date: el.querySelector('#brew-date').value || todayStr(),
          note: el.querySelector('#brew-note').value.trim(),
          rating,
        });
        vibrate(10);
        toast(`冲煮 ${fmtG(g)}g 已记录 ☕`, 'ok');
        close();
        rerender();
      };
    },
  });
}

/* ---------------- 分豆弹层 ---------------- */
function shareSheet(bean) {
  const html = `
    <div class="quick-row">
      <button class="quick-pill" data-g="50">50g</button>
      <button class="quick-pill" data-g="100">100g</button>
      <button class="quick-pill" data-g="150">150g</button>
    </div>
    <div class="field-row">
      <div class="field"><label>克数（g）*</label>
        <input type="number" id="share-g" inputmode="decimal" min="0.1" step="0.1" value="100"/></div>
      <div class="field"><label>日期</label>
        <input type="date" id="share-date" value="${todayStr()}" max="${todayStr()}"/></div>
    </div>
    <div class="field"><label>备注（选填）</label>
      <input type="text" id="share-note" placeholder="送给哪位咖友？想留句话？"/></div>
    <button class="btn primary block" id="share-save">分豆出库</button>`;

  sheet({
    title: `🎁 ${bean.name || '分豆'}`,
    html,
    onMount(el, close) {
      el.querySelectorAll('.quick-pill').forEach((p) => {
        p.onclick = () => {
          el.querySelectorAll('.quick-pill').forEach((x) => x.classList.toggle('on', x === p));
          el.querySelector('#share-g').value = p.dataset.g;
        };
      });
      el.querySelector('.quick-pill').classList.add('on');
      el.querySelector('#share-save').onclick = async () => {
        const g = parseFloat(el.querySelector('#share-g').value);
        if (!(g > 0)) { toast('请输入有效克数', 'err'); return; }
        await addTx(bean.id, {
          type: 'share', grams: g,
          date: el.querySelector('#share-date').value || todayStr(),
          note: el.querySelector('#share-note').value.trim(),
        });
        vibrate(10);
        toast(`已分出 ${fmtG(g)}g 🎁`, 'ok');
        close();
        rerender();
      };
    },
  });
}

/* ---------------- 修正弹层 ---------------- */
function adjustSheet(bean) {
  const html = `
    <div class="muted" style="text-align:center;margin-bottom:14px;">当前剩余 <b style="color:var(--ink);font-family:var(--serif);font-size:16px;">${fmtG(bean.remainingWeight)} g</b> · 称重后填入实际值</div>
    <div class="field"><label>实际剩余克重（g）*</label>
      <input type="number" id="adj-g" inputmode="decimal" min="0" max="10000" step="0.1" value="${bean.remainingWeight}"/></div>
    <div class="field"><label>备注（选填）</label>
      <input type="text" id="adj-note" placeholder="如：称重校准" maxlength="40"/></div>
    <button class="btn primary block" id="adj-save">保存修正</button>`;

  sheet({
    title: '⚖️ 修正克重',
    html,
    onMount(el, close) {
      el.querySelector('#adj-save').onclick = async () => {
        const target = parseFloat(el.querySelector('#adj-g').value);
        if (isNaN(target) || target < 0) { toast('请输入有效克数', 'err'); return; }
        const delta = Math.round((target - (Number(bean.remainingWeight) || 0)) * 10) / 10;
        if (delta === 0) { toast('克重没有变化'); close(); return; }
        await addTx(bean.id, {
          type: 'adjust', grams: delta,
          date: todayStr(),
          note: el.querySelector('#adj-note').value.trim() || (delta > 0 ? '补入' : '修正'),
        });
        toast(`已修正为 ${fmtG(target)}g`, 'ok');
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
