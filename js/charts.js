/* 鉴豆 · 手绘 SVG 图表：条形 / 环形 / 雷达 / 面积 */

export const PALETTE = ['#B0763B', '#8F5D2C', '#C99B6A', '#6B7F5C', '#A65B44', '#7A6B5C', '#5C7382', '#D0A96F'];
const OTHER_COLOR = '#D8CCBB';
const INK3 = '#AE9E8D';

function esc2(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---------- 横向条形图 ----------
   items: [{label, value}]（已排序，条数建议 ≤ 6） */
export function barChart(items, { unit = '' } = {}) {
  if (!items.length) return '';
  const W = 320, rowH = 36, top = 6;
  const H = top + items.length * rowH + 4;
  const max = Math.max(...items.map((i) => i.value), 1);
  const labelW = 76, valW = 44, gap = 10;
  const barMaxX = W - valW - 8;

  let out = '';
  items.forEach((it, idx) => {
    const y = top + idx * rowH;
    const bw = Math.max(4, ((barMaxX - labelW - gap) * it.value) / max);
    out += `
      <text x="${labelW - 8}" y="${y + 17}" text-anchor="end" font-size="11.5" fill="#7A6B5C">${esc2(trunc(it.label, 8))}</text>
      <rect x="${labelW}" y="${y + 7}" width="${barMaxX - labelW}" height="10" rx="5" fill="#EFE7D9"/>
      <rect x="${labelW}" y="${y + 7}" width="${bw}" height="10" rx="5" fill="${PALETTE[idx % PALETTE.length]}">
        <animate attributeName="width" from="0" to="${bw}" dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>
      </rect>
      <text x="${W - 4}" y="${y + 17.5}" text-anchor="end" font-size="11.5" font-weight="700" fill="#2C221A" font-family="serif">${it.value}${unit}</text>`;
  });
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
}

function trunc(s, n) { return String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''); }

/* ---------- 环形图 ----------
   items: [{label, value}]（可包含“其他”），返回 { svg, legend } */
export function donutChart(items) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const C = 2 * Math.PI * 44;
  let acc = 0, segs = '';
  items.forEach((it, idx) => {
    const len = (it.value / total) * C;
    const color = it.label === '其他' ? OTHER_COLOR : PALETTE[idx % PALETTE.length];
    if (it.value > 0) {
      segs += `<circle cx="80" cy="80" r="44" fill="none" stroke="${color}" stroke-width="15"
        stroke-dasharray="${Math.max(len - 1.5, 0.5)} ${C}" stroke-dashoffset="${-acc}" transform="rotate(-90 80 80)"/>`;
      acc += len;
    }
  });
  const legend = items.map((it, idx) => {
    const color = it.label === '其他' ? OTHER_COLOR : PALETTE[idx % PALETTE.length];
    const pct = total ? Math.round((it.value / total) * 100) : 0;
    return `<span class="legend-item"><i class="legend-dot" style="background:${color}"></i>${esc2(trunc(it.label, 10))} <span style="color:#AE9E8D">${pct}%</span></span>`;
  }).join('');
  return {
    svg: `<svg class="chart-svg" viewBox="0 0 160 160" style="max-width:150px;margin:0 auto;" xmlns="http://www.w3.org/2000/svg">
      ${segs}
      <text x="80" y="76" text-anchor="middle" font-size="22" font-weight="700" fill="#2C221A" font-family="serif">${total}</text>
      <text x="80" y="94" text-anchor="middle" font-size="10" fill="#AE9E8D">包</text>
    </svg>`,
    legend: `<div class="legend">${legend}</div>`,
  };
}

/* ---------- 雷达图（评分 7 维，0~10） ---------- */
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
