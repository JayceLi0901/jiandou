/* 鉴豆 · 统计看板：总览 / 消耗趋势 / 豆种 / 产地 / 处理法 / 烘焙商 / 评分排行 */
import { db } from '../db.js';
import { barChart, donutChart, areaChart } from '../charts.js';
import { avgRatings, parseDate, esc, fmtG } from '../util.js';

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
      <div class="card-title">近 8 周冲煮消耗<b>${fmtG(brewGrams)} g</b></div>
      ${weeklyArea(brews) || '<div class="muted" style="padding:10px 0;">还没有冲煮记录</div>'}
    </div>

    <div class="card">
      <div class="card-title">喝过的豆种 TOP</div>
      ${barChart(topBy(beans, 'variety', 5), { unit: '' }) || ''}
    </div>

    <div class="card">
      <div class="card-title">产地分布</div>
      ${donutBlock(beans, 'origin')}
    </div>

    <div class="card">
      <div class="card-title">处理法分布</div>
      ${donutBlock(beans, 'process')}
    </div>

    <div class="card">
      <div class="card-title">烘焙商 TOP</div>
      ${barChart(topBy(beans, 'roaster', 5))}
    </div>

    <div class="card">
      <div class="card-title">评分排行 · 按整体分</div>
      ${rankHtml(beans, txs)}
    </div>`;
}

/* ---------- 近 8 周面积图 ---------- */
function weeklyArea(brews) {
  const weeks = []; // [mondayDate, grams]
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let i = 7; i >= 0; i--) {
    const m = new Date(monday);
    m.setDate(m.getDate() - i * 7);
    weeks.push([m, 0]);
  }
  for (const t of brews) {
    const d = parseDate(t.date);
    if (!d) continue;
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (d >= weeks[i][0]) { weeks[i][1] += Number(t.grams) || 0; break; }
    }
  }
  if (!brews.length) return '';
  const label = (m) => `${m.getMonth() + 1}/${m.getDate()}`;
  return areaChart(weeks.map(([m, g], i) => ({ label: i === weeks.length - 1 ? '本周' : label(m), value: Math.round(g) })));
}

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

function donutBlock(beans, key) {
  const d = donutChart(topBy(beans, key, 5));
  return `${d.svg}${d.legend}`;
}

/* ---------- 评分排行 ---------- */
function rankHtml(beans, txs) {
  const byBean = new Map();
  for (const t of txs) {
    if (!byBean.has(t.beanId)) byBean.set(t.beanId, []);
    byBean.get(t.beanId).push(t);
  }
  const ranked = beans
    .map((b) => ({ bean: b, avg: avgRatings(byBean.get(b.id) || []) }))
    .filter((r) => r.avg && r.avg.overall > 0)
    .sort((a, b) => b.avg.overall - a.avg.overall)
    .slice(0, 5);
  if (!ranked.length) return `<div class="muted" style="padding:10px 0;">冲煮时打过分，这里会出现你的高分榜单 🏆</div>`;
  return ranked.map((r, i) => `
    <a class="rank-item" href="#/bean/${r.bean.id}">
      <span class="rank-no ${i < 3 ? 'top' : ''}">${i + 1}</span>
      <span class="rank-main">
        <span class="rank-name">${esc(r.bean.name || '未命名')}</span>
        <span class="rank-sub">${esc(r.bean.roaster || r.bean.origin || '')} · ${r.avg._count} 次打分</span>
      </span>
      <span class="rank-score">${r.avg.overall}</span>
    </a>`).join('');
}
