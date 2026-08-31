/* 鉴豆 · 统计看板：总览 / 消耗趋势 / 豆种 / 产地 / 处理法 / 烘焙商 / 评分排行 */
import { db } from '../db.js';
import { barChart, donutChart, areaChart } from '../charts.js';
import { avgRatings, parseDate, esc, fmtG } from '../util.js';
import { sheet } from '../ui.js';

export async function render(view) {
  const beans = await db.beans.all();
  if (!beans.length) {
    view.innerHTML = `
      <div class="page-head"><div class="page-title">统计</div></div>
      <div class="empty"><div class="empty-art">📊</div><h3>还没有数据</h3><p>建档并记录几笔冲煮后，这里会出现你的咖啡看板</p></div>`;
    return;
  }
  const txs = await db.txs.all();
  const active = beans.filter((b) => !b.archived);
  const brews = txs.filter((t) => t.type === 'brew');
  const brewGrams = brews.reduce((s, t) => s + (Number(t.grams) || 0), 0);
  const totalRemain = active.reduce((s, b) => s + (Number(b.remainingWeight) || 0), 0);
  const beanById = new Map(beans.map((b) => [b.id, b]));

  const originItems = topBy(beans, 'origin', 5);
  const processItems = topBy(beans, 'process', 5);
  const roasterItems = topBy(beans, 'roaster', 5);
  const originDonut = donutChart(originItems);
  const processDonut = donutChart(processItems);

  view.innerHTML = `
    <div class="page-head">
      <div class="page-title">统计</div>
      <div class="page-sub">你的咖啡风味数据看板</div>
    </div>

    <div class="stat-grid">
      <div class="stat-cell"><div class="num">${active.length}<small>包</small></div><div class="cap">在存豆子</div></div>
      <div class="stat-cell"><div class="num">${fmtG(totalRemain)}<small>g</small></div><div class="cap">剩余总量</div></div>
      <div class="stat-cell"><div class="num">${brews.length}<small>次</small></div><div class="cap">累计冲煮</div></div>
      <div class="stat-cell"><div class="num">${fmtG(brewGrams)}<small>g</small></div><div class="cap">累计喝掉</div></div>
    </div>

    <div class="card">
      <div class="card-title stats-filter-head"><span id="consumption-title">本周冲煮消耗</span>
        <select id="stats-range" class="stats-range" aria-label="选择统计时间范围">
          <option value="week">本周</option><option value="month">近一月</option>
          <option value="quarter">近一季度</option><option value="year">近一年</option><option value="all">全部</option>
        </select>
      </div>
      <div id="consumption-chart"></div>
      <div class="muted" style="margin-top:6px;">点曲线上的圆点，看那天 / 那周的冲煮明细</div>
    </div>

    <div class="card">
      <div class="card-title">喝过的豆种 TOP</div>
      <div id="variety-chart">${barChart(topBy(beans, 'variety', 5), { unit: '' }) || ''}</div>
    </div>

    <div class="card">
      <div class="card-title">产地分布</div>
      <div class="donut-box" id="donut-origin"><div class="donut-stage">${originDonut.svg}<div class="donut-detail" hidden><div class="donut-detail-name"></div><div class="donut-detail-meta"></div></div></div>${originDonut.legend}
        <div class="muted" style="margin-top:8px;">点扇区或图例单独查看 · 点「其他」看完整列表</div></div>
    </div>

    <div class="card">
      <div class="card-title">处理法分布</div>
      <div class="donut-box" id="donut-process"><div class="donut-stage">${processDonut.svg}<div class="donut-detail" hidden><div class="donut-detail-name"></div><div class="donut-detail-meta"></div></div></div>${processDonut.legend}
        <div class="muted" style="margin-top:8px;">点扇区或图例单独查看 · 点「其他」看完整列表</div></div>
    </div>

    <div class="card">
      <div class="card-title">烘焙商 TOP</div>
      <div id="roaster-chart">${barChart(roasterItems, { labelAlign: 'start' })}</div>
      <div class="muted" style="margin-top:6px;">有多个烘焙商时，点「其他」看完整列表</div>
    </div>

    <div class="card">
      <div class="card-title" id="rank-title">风味排名 · 本周</div>
      <div id="rank-list"></div>
    </div>`;

  /* 环形图交互：点扇区/图例 → 高亮单项并在图侧显示明细；点「其他」→ 弹窗列全部分类 */
  wireDonut(view.querySelector('#donut-origin'), originItems, () => showOtherSheet('产地', beans, 'origin'));
  wireDonut(view.querySelector('#donut-process'), processItems, () => showOtherSheet('处理法', beans, 'process'));
  wireBarOther(view.querySelector('#roaster-chart'), () => showOtherSheet('烘焙商', beans, 'roaster'));

  const range = view.querySelector('#stats-range');
  let curPoints = [];
  let curBrews = [];
  const applyRange = () => {
    const info = rangeInfo(range.value, brews);
    view.querySelector('#consumption-title').textContent = `${info.label}冲煮消耗`;
    view.querySelector('#consumption-chart').innerHTML = `<div class="consumption-total">${fmtG(info.grams)}<small>g</small></div>${info.filtered.length ? areaChart(info.points) : '<div class="muted consumption-empty">这段时间还没有冲煮记录</div>'}`;
    view.querySelector('#rank-title').textContent = `风味排名 · ${info.label}`;
    view.querySelector('#rank-list').innerHTML = rankHtml(beans, info.filtered, rankExpanded);
    curPoints = info.points;
    curBrews = info.filtered;
    wireDots();
    wireRankToggle();
  };
  /* 点消耗曲线数据点 → 弹窗展示该时段每笔冲煮 */
  const wireDots = () => {
    view.querySelectorAll('#consumption-chart .chart-dot-hit').forEach((dot) => {
      dot.addEventListener('click', () => {
        const i = Number(dot.dataset.i);
        const p = curPoints[i];
        if (!p) return;
        showPeriodSheet(range.value, p, curBrews, beanById);
      });
    });
  };
  const wireRankToggle = () => {
    view.querySelector('#rank-toggle')?.addEventListener('click', () => {
      rankExpanded = !rankExpanded;
      const info = rangeInfo(range.value, brews);
      view.querySelector('#rank-list').innerHTML = rankHtml(beans, info.filtered, rankExpanded);
      wireRankToggle();
    });
  };
  range.addEventListener('change', applyRange);
  applyRange();
}

/* ---------- 弹窗：某时段的冲煮明细 ---------- */
function showPeriodSheet(rangeVal, point, brews, beanById) {
  const keyOf = (t) => {
    const d = parseDate(t.date);
    if (!d) return null;
    if (rangeVal === 'week') return dateKey(d);
    if (rangeVal === 'month') return Math.min(4, Math.max(0, 4 - Math.floor((Date.now() - d) / 604800000)));
    if (rangeVal === 'all' && /^\d{4}$/.test(String(point.key))) return String(d.getFullYear());
    return monthKey(d);
  };
  const rows = brews
    .map((t) => ({ t, k: keyOf(t) }))
    .filter((r) => r.k === point.key)
    .sort((a, b) => (a.t.date < b.t.date ? 1 : -1));
  const grams = rows.reduce((s, r) => s + (Number(r.t.grams) || 0), 0);
  const title = `${point.label}的冲煮 · ${rows.length} 笔 · ${fmtG(grams)}g`;
  const list = rows.length ? rows.map(({ t }) => {
    const b = beanById.get(t.beanId);
    return `<a class="stat-detail-row" href="#/bean/${t.beanId}">
      <span class="stat-detail-main"><span class="stat-detail-name">${esc(b?.name || '已删除的档案')}</span>
      <span class="stat-detail-sub">${esc(t.date)}${b?.roaster ? ' · ' + esc(b.roaster) : ''}</span></span>
      <span class="stat-detail-val">${fmtG(t.grams)}g</span>
    </a>`;
  }).join('') : '<div class="muted" style="padding:14px 0;">这个时段没有冲煮记录</div>';
  sheet({ title, html: `<div class="stat-detail-list">${list}</div>` });
}

/* ---------- 弹窗：「其他」的完整分类明细 ---------- */
function showOtherSheet(kindLabel, beans, field) {
  const full = topByFull(beans, field);
  const title = `${kindLabel} · 全部 ${full.length} 类`;
  const max = Math.max(...full.map((i) => i.value), 1);
  const list = full.map((it, idx) => `
    <div class="stat-detail-row" style="cursor:default;">
      <span class="stat-detail-main"><span class="stat-detail-name">${esc(it.label)}</span></span>
      <span class="stat-detail-bar"><i style="width:${Math.max(6, 100 * it.value / max)}%"></i></span>
      <span class="stat-detail-val">${it.value} 包</span>
    </div>`).join('');
  sheet({ title, html: `<div class="stat-detail-list">${list}</div>` });
}

function topByFull(beans, key) {
  const map = new Map();
  for (const b of beans) {
    const k = (b[key] || '').trim() || '未记录';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'zh'));
}

/* 烘焙商柱状图的「其他」行点击 → 弹窗（柱状图是 SVG text，加透明热区） */
function wireBarOther(container, onOther) {
  if (!container) return;
  const texts = container.querySelectorAll('text');
  texts.forEach((t) => {
    if (t.textContent === '其他') {
      t.style.cursor = 'pointer';
      t.style.textDecoration = 'underline dotted';
      t.style.textUnderlineOffset = '3px';
      t.addEventListener('click', onOther);
    }
  });
}

function wireDonut(box, items, onOther) {
  if (!box) return;
  const segs = box.querySelectorAll('.donut-seg');
  const legs = box.querySelectorAll('.legend-item');
  const detail = box.querySelector('.donut-detail');
  const detailName = box.querySelector('.donut-detail-name');
  const detailMeta = box.querySelector('.donut-detail-meta');
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  let sel = -1;

  const paint = () => {
    segs.forEach((s) => s.classList.toggle('dim', sel !== -1 && Number(s.dataset.i) !== sel));
    legs.forEach((l) => l.classList.toggle('sel', sel !== -1 && Number(l.dataset.i) === sel));
    detail.hidden = sel === -1;
    if (sel !== -1) {
      const it = items[sel] || { label: '—', value: 0 };
      const pct = Math.round((it.value / total) * 100);
      detailName.textContent = String(it.label);
      detailMeta.textContent = it.label === '其他' ? `${it.value} 包 · 点「其他」看明细` : `${it.value} 包 · ${pct}%`;
    }
  };
  [...segs, ...legs].forEach((el) => {
    el.addEventListener('click', () => {
      const i = Number(el.dataset.i);
      const it = items[i];
      if (it && it.label === '其他' && onOther) { onOther(); return; }
      sel = sel === i ? -1 : i;
      paint();
    });
  });
  paint();
}

/* ---------- 时间范围与消费趋势 ---------- */
const RANGE_LABELS = { week: '本周', month: '近一月', quarter: '近一季度', year: '近一年', all: '全部' };

function rangeInfo(range, brews) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  let start = monday;
  if (range === 'month') { start = new Date(now); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0); }
  if (range === 'quarter') { start = new Date(now); start.setMonth(start.getMonth() - 2, 1); start.setHours(0, 0, 0, 0); }
  if (range === 'year') { start = new Date(now.getFullYear(), now.getMonth() - 11, 1); }
  if (range === 'all') start = null;
  const filtered = brews.filter((t) => { const d = parseDate(t.date); return d && (!start || d >= start) && d <= now; });
  const grams = filtered.reduce((s, t) => s + (Number(t.grams) || 0), 0);
  return { label: RANGE_LABELS[range] || RANGE_LABELS.week, filtered, grams, points: consumptionPoints(range, filtered, start, now) };
}

function consumptionPoints(range, brews, start, now) {
  let points = [];
  if (range === 'week') {
    points = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return { key: dateKey(d), label: ['一','二','三','四','五','六','日'][i], value: 0 }; });
  } else if (range === 'month') {
    points = Array.from({ length: 5 }, (_, i) => ({ key: i, label: i === 4 ? '本周' : `${4 - i}周前`, value: 0 }));
  } else {
    let first = start;
    if (!first) {
      const ds = brews.map((t) => parseDate(t.date)).filter(Boolean).sort((a, b) => a - b);
      first = ds[0] || new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const months = (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1;
    if (range === 'all' && months > 24) {
      points = Array.from({ length: now.getFullYear() - first.getFullYear() + 1 }, (_, i) => ({ key: String(first.getFullYear() + i), label: `${first.getFullYear() + i}`, value: 0 }));
    } else {
      points = Array.from({ length: months }, (_, i) => { const d = new Date(first.getFullYear(), first.getMonth() + i, 1); return { key: monthKey(d), label: `${d.getMonth() + 1}月`, value: 0 }; });
    }
  }
  for (const t of brews) {
    const d = parseDate(t.date); if (!d) continue;
    let key;
    if (range === 'week') key = dateKey(d);
    else if (range === 'month') key = Math.min(4, Math.max(0, 4 - Math.floor((now - d) / 604800000)));
    else if (range === 'all' && points.length && /^\d{4}$/.test(points[0].key)) key = String(d.getFullYear());
    else key = monthKey(d);
    const p = points.find((x) => x.key === key); if (p) p.value += Number(t.grams) || 0;
  }
  return points.map(({ key, label, value }) => ({ key, label, value: Math.round(value) }));
}

function dateKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function monthKey(d) { return `${d.getFullYear()}-${d.getMonth()}`; }

/* ---------- 计数 TOP（含「其他」合并） ---------- */
function topBy(beans, key, n) {
  const map = new Map();
  for (const b of beans) {
    const k = (b[key] || '').trim() || '未记录';
    map.set(k, (map.get(k) || 0) + 1);
  }
  let arr = [...map.entries()].map(([label, value]) => ({ label, value }));
  if (!arr.length) return [{ label: '暂无', value: 0 }];
  arr.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'zh'));
  if (arr.length > n) {
    const rest = arr.slice(n).reduce((s, i) => s + i.value, 0);
    arr = [...arr.slice(0, n), { label: '其他', value: rest }];
  }
  return arr.filter((i) => i.value > 0);
}

/* ---------- 评分排行（默认前 5，可展开全部） ---------- */
let rankExpanded = false;
function rankHtml(beans, txs, expanded) {
  const byBean = new Map();
  for (const t of txs) {
    if (!byBean.has(t.beanId)) byBean.set(t.beanId, []);
    byBean.get(t.beanId).push(t);
  }
  const rankedAll = beans
    .map((b) => ({ bean: b, avg: avgRatings(byBean.get(b.id) || []) }))
    .filter((r) => r.avg && r.avg.overall > 0)
    .sort((a, b) => b.avg.overall - a.avg.overall);
  if (!rankedAll.length) return `<div class="muted" style="padding:10px 0;">冲煮时打过分，这里会出现你的高分榜单 🏆</div>`;
  const ranked = expanded ? rankedAll : rankedAll.slice(0, 5);
  const items = ranked.map((r, i) => `
    <a class="rank-item rank-${i + 1}" href="#/bean/${r.bean.id}">
      <span class="rank-no medal-${i + 1}">${i + 1}</span>
      <span class="rank-main">
        <span class="rank-name">${esc(r.bean.name || '未命名')}</span>
        <span class="rank-sub">${esc(r.bean.roaster || r.bean.origin || '')} · ${r.avg._count} 次打分</span>
      </span>
      <span class="rank-score">${r.avg.overall}</span>
    </a>`).join('');
  const toggle = rankedAll.length > 5
    ? `<button class="rank-toggle" id="rank-toggle">${expanded ? '收起 ▲' : `展开全部 ${rankedAll.length} 个 ▼`}</button>`
    : '';
  return items + toggle;
}
