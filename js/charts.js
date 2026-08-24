/* 鉴豆 · 手绘 SVG 图表：条形 / 环形 / 雷达 / 面积 */

export const PALETTE = ['#B0763B', '#8F5D2C', '#C99B6A', '#6B7F5C', '#A65B44', '#7A6B5C', '#5C7382', '#D0A96F'];
const OTHER_COLOR = '#D8CCBB';
const INK3 = '#AE9E8D';

function esc2(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---------- 横向条形图（标签自适应全名，条形随标签宽度收缩） ----------
   items: [{label, value}]（已排序，条数建议 ≤ 6） */
export function barChart(items, { unit = '', labelAlign = 'end' } = {}) {
  if (!items.length) return '';
  const W = 320, rowH = 36, top = 6;
  const H = top + items.length * rowH + 4;
  const max = Math.max(...items.map((i) => i.value), 1);
  const valW = 34;

  let out = '';
  items.forEach((it, idx) => {
    const y = top + idx * rowH;
    const chars = [...String(it.label)].length;
    /* 名字越长字号越小、标签区越宽；条形区相应收缩 */
    const fs = chars <= 4 ? 12 : chars <= 6 ? 11 : chars <= 10 ? 10 : 9;
    const labelW = Math.min(180, Math.max(54, chars * fs + 12));
    const x0 = labelW + 4;
    const barMax = W - valW - 4 - x0;
    const bw = Math.max(4, (barMax * it.value) / max);
    const estimated = chars * fs;
    const fit = estimated > labelW - 4 ? ` textLength="${labelW - 4}" lengthAdjust="spacingAndGlyphs"` : '';
    const labelX = labelAlign === 'start' ? 0 : labelW;
    const anchor = labelAlign === 'start' ? 'start' : 'end';
    out += `
      <text x="${labelX}" y="${y + 17}" text-anchor="${anchor}" font-size="${fs}" fill="#7A6B5C"${fit}>${esc2(it.label)}</text>
      <rect x="${x0}" y="${y + 7}" width="${barMax}" height="10" rx="5" fill="#EFE7D9"/>
      <rect x="${x0}" y="${y + 7}" width="${bw}" height="10" rx="5" fill="${PALETTE[idx % PALETTE.length]}">
        <animate attributeName="width" from="0" to="${bw}" dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>
      </rect>
      <text x="${W - 2}" y="${y + 17}" text-anchor="end" font-size="11" font-weight="700" fill="#2C221A" font-family="serif">${it.value}${unit}</text>`;
  });
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
}

function trunc(s, n) { return String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''); }

/* ---------- 环形图（可交互：点扇区/图例 → 单独高亮，明细由页面展示在图侧） ----------
   items: [{label, value}]（可包含“其他”），返回 { svg, legend } */
export function donutChart(items) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const CX = 80, CY = 80, R0 = 52, R1 = 34;
  const pt = (ang, r) => `${(CX + r * Math.cos(ang)).toFixed(1)},${(CY + r * Math.sin(ang)).toFixed(1)}`;

  let a = -Math.PI / 2, segs = '';
  items.forEach((it, idx) => {
    if (it.value > 0) {
      const a1 = a + (it.value / total) * 2 * Math.PI;
      const large = a1 - a > Math.PI ? 1 : 0;
      const color = it.label === '其他' ? OTHER_COLOR : PALETTE[idx % PALETTE.length];
      const full = Math.abs(a1 - a - 2 * Math.PI) < 0.0001;
      const d = full
        ? `M ${pt(a, R0)} A ${R0} ${R0} 0 1 1 ${pt(a + Math.PI, R0)} A ${R0} ${R0} 0 1 1 ${pt(a, R0)} L ${pt(a, R1)} A ${R1} ${R1} 0 1 0 ${pt(a + Math.PI, R1)} A ${R1} ${R1} 0 1 0 ${pt(a, R1)} Z`
        : `M ${pt(a, R0)} A ${R0} ${R0} 0 ${large} 1 ${pt(a1, R0)} L ${pt(a1, R1)} A ${R1} ${R1} 0 ${large} 0 ${pt(a, R1)} Z`;
      segs += `<path class="donut-seg" data-i="${idx}" fill="${color}" d="${d}"/>`;
      a = a1;
    } else {
      /* value=0 的项也占索引，保证与图例 data-i 对齐 */
    }
  });
  const legend = items.map((it, idx) => {
    const color = it.label === '其他' ? OTHER_COLOR : PALETTE[idx % PALETTE.length];
    const pct = total ? Math.round((it.value / total) * 100) : 0;
    return `<span class="legend-item" data-i="${idx}"><i class="legend-dot" style="background:${color}"></i>${esc2(trunc(it.label, 10))} <span style="color:#AE9E8D">${pct}%</span></span>`;
  }).join('');
  return {
    svg: `<svg class="chart-svg" viewBox="0 0 160 160" style="max-width:160px;margin:0 auto;" xmlns="http://www.w3.org/2000/svg">
      ${segs}
      <text class="donut-c1" x="80" y="74" text-anchor="middle" font-size="21" font-weight="700" fill="#2C221A" font-family="serif">${total}</text>
      <text class="donut-c2" x="80" y="92" text-anchor="middle" font-size="10" fill="#AE9E8D">包</text>
    </svg>`,
    legend: `<div class="legend">${legend}</div>`,
  };
}

/* ---------- 雷达图（评分维度自适应，0~10） ---------- */
export function radarChart(dims, { max = 10 } = {}) {
  const cx = 110, cy = 112, R = 70;
  const n = dims.length;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  let rings = '', axes = '', labels = '', web = '';

  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const pts = dims.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(',')).join(' ');
    rings += `<polygon points="${pts}" fill="none" stroke="#EFE7D9" stroke-width="1"/>`;
  });
  dims.forEach((d, i) => {
    const [x, y] = pt(i, R);
    axes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#EFE7D9" stroke-width="1"/>`;
    const [lx, ly] = pt(i, R + 17);
    const anchor = Math.abs(lx - cx) < 6 ? 'middle' : lx > cx ? 'start' : 'end';
    labels += `<text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" text-anchor="${anchor}" font-size="10.5" fill="#7A6B5C">${esc2(d.label)}</text>`;
  });

  const valPts = dims.map((d, i) => pt(i, R * Math.min(d.value / max, 1)).map((v) => v.toFixed(1)).join(',')).join(' ');
  web = `<polygon points="${valPts}" fill="rgba(176,118,59,.20)" stroke="#B0763B" stroke-width="1.6" stroke-linejoin="round"/>`;
  dims.forEach((d, i) => {
    const [x, y] = pt(i, R * Math.min(d.value / max, 1));
    web += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="#8F5D2C"/>`;
  });

  return `<svg class="chart-svg" viewBox="0 0 220 222" xmlns="http://www.w3.org/2000/svg">${rings}${axes}${web}${labels}</svg>`;
}

/* ---------- 面积图（近 N 周消耗） ---------- */
export function areaChart(points, { unit = 'g' } = {}) {
  const W = 320, H = 150, pl = 10, pr = 10, pt2 = 16, pb = 24;
  const n = points.length;
  if (!n) return '';
  const max = Math.max(...points.map((p) => p.value), 10);
  const X = (i) => pl + (i * (W - pl - pr)) / Math.max(n - 1, 1);
  const Y = (v) => H - pb - ((v / max) * (H - pt2 - pb));
  const maxV = Math.max(...points.map((p) => p.value));

  let line = '', dots = '', labelsX = '';
  const coords = points.map((p, i) => [X(i), Y(p.value)]);
  coords.forEach(([x, y], i) => {
    if (i === 0) line += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    else {
      const [px, py] = coords[i - 1];
      const mx = (px + x) / 2;
      line += ` C ${mx.toFixed(1)} ${py.toFixed(1)}, ${mx.toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    const isPeak = points[i].value === maxV && maxV > 0;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isPeak ? 3.4 : 2.6}" fill="${isPeak ? '#8F5D2C' : '#FFFDF9'}" stroke="#B0763B" stroke-width="1.6"/>`;
    if (i % 2 === (n % 2 === 0 ? 1 : 0) || n <= 5) {
      labelsX += `<text x="${x.toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="9.5" fill="#AE9E8D">${esc2(points[i].label)}</text>`;
    }
  });
  const area = `${line} L ${coords[coords.length - 1][0].toFixed(1)} ${H - pb} L ${coords[0][0].toFixed(1)} ${H - pb} Z`;

  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(176,118,59,.30)"/><stop offset="1" stop-color="rgba(176,118,59,.02)"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#ag)"/>
    <path d="${line}" fill="none" stroke="#B0763B" stroke-width="2" stroke-linecap="round"/>
    ${dots}${labelsX}
  </svg>`;
}
