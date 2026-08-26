/* 鉴豆 · 流水分享卡片：单笔记录 + 该笔评分 → Canvas 绘制 → PNG 保存 */
import { RATING_DIMS, ratingScores, fmtG, fmtDuration } from './util.js';
import { toast } from './ui.js';

const CREAM = '#F6F1E8', CARD = '#FFFDF9', INK = '#2C221A', INK2 = '#7A6B5C', INK3 = '#AE9E8D';
const ACCENT = '#B0763B', ACCENT_DEEP = '#8F5D2C', HAIR = 'rgba(60,45,30,.12)';
const SERIF = '"Noto Serif SC","Songti SC",serif';
const NUM = '"Playfair Display","Noto Serif SC",serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxW, maxLines = 3) {
  const lines = [];
  let line = '';
  for (const ch of String(text || '')) {
    if (ctx.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) { lines[maxLines - 1] = lines[maxLines - 1] + '…'; return lines; }
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

function metaLine(tx) {
  const p = [];
  if (tx.params) {
    if (tx.params.temp != null) p.push(tx.params.temp + '°C');
    if (tx.params.ratio) p.push('1:' + tx.params.ratio);
    if (tx.params.water != null) p.push(fmtG(tx.params.water) + 'g 水');
    if (tx.params.bypass > 0) p.push('bypass ' + fmtG(tx.params.bypass) + 'g');
    if (tx.params.duration != null) p.push(fmtDuration(tx.params.duration));
    if (tx.params.grind) p.push(tx.params.grind);
  }
  if (tx.equip) for (const v of Object.values(tx.equip)) if (v) p.push(v);
  return p.join(' · ');
}

function drawRadar(ctx, cx, cy, R, avg) {
  const dims = RATING_DIMS;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / dims.length;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  ctx.strokeStyle = '#EFE7D9';
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    ctx.beginPath();
    dims.forEach((_, i) => { const [x, y] = pt(i, R * f); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.stroke();
  });
  dims.forEach((_, i) => {
    const [x, y] = pt(i, R);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
  });
  /* 分数多边形 */
  ctx.beginPath();
  dims.forEach((d, i) => {
    const v = Math.min(avg?.[d.key] || 0, 10) / 10;
    const [x, y] = pt(i, R * v);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(176,118,59,.22)';
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.stroke();
  dims.forEach((d, i) => {
    const v = Math.min(avg?.[d.key] || 0, 10) / 10;
    const [x, y] = pt(i, R * v);
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = ACCENT_DEEP; ctx.fill();
  });
  /* 维度标签：上/下顶点居中，左右侧顶点按切向外推（与 charts.js SVG 雷达一致） */
  ctx.font = `12px ${SERIF}`;
  ctx.fillStyle = INK2;
  dims.forEach((d, i) => {
    const [x, y] = pt(i, R + 18);
    if (Math.abs(x - cx) < 8) {
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x, y + 4);
    } else {
      ctx.textAlign = x > cx ? 'left' : 'right';
      ctx.fillText(d.label, x + (x > cx ? 4 : -4), y + 4);
    }
  });
  ctx.textAlign = 'left';
}

export async function exportTxCard(bean, tx) {
  try {
    await document.fonts.ready;
    const W = 750, PAD = 30;
    const score = tx.rating ? ratingScores(tx.rating) : null;
    const hasRate = !!score?.overall;

    /* 先按真实文字行数排版，再决定画布高度，避免固定高度造成底部大面积空白。 */
    const probe = document.createElement('canvas').getContext('2d');
    const textW = W - (PAD + 38) * 2;
    probe.font = `14px ${SERIF}`;
    const ml = metaLine(tx);
    const metaLines = ml ? wrapText(probe, ml, textW, 3) : [];
    const noteLines = tx.note ? wrapText(probe, '「' + tx.note + '」', textW, 4) : [];
    let contentY = PAD + 56;       // 品牌行
    contentY += 56 + 36 + 30;     // 豆名、烘焙商、分隔线
    contentY += 54;               // 克重
    if (metaLines.length) contentY += 38 + metaLines.length * 27;
    if (noteLines.length) contentY += 34 + noteLines.length * 29;
    contentY += 34 + 34;          // 评分分隔线与标题
    contentY += hasRate ? 370 : 48;
    const H = Math.ceil(contentY + 66); // 页脚与底部留白

    const scale = 2;
    const cv = document.createElement('canvas');
    cv.width = W * scale; cv.height = H * scale;
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);

    /* 背景 + 卡片 */
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H);
    roundRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, 26);
    ctx.fillStyle = CARD; ctx.fill();
    const L = PAD + 38, R = W - PAD - 38;
    let y = PAD + 56;

    /* 品牌行 */
    ctx.textAlign = 'left';
    ctx.font = `700 24px ${SERIF}`;
    ctx.fillStyle = ACCENT_DEEP;
    ctx.fillText('鉴豆', L, y);
    ctx.textAlign = 'right';
    ctx.font = `13px ${SERIF}`;
    ctx.fillStyle = INK3;
    ctx.fillText(tx.date, R, y);
    ctx.textAlign = 'left';

    /* 豆名 + 烘焙商 */
    y += 56;
    ctx.font = `700 34px ${SERIF}`;
    ctx.fillStyle = INK;
    ctx.fillText((bean.name || '未命名').slice(0, 16), L, y);
    y += 36;
    ctx.font = `16px ${SERIF}`;
    ctx.fillStyle = INK2;
    ctx.fillText([bean.roaster, bean.origin].filter(Boolean).join(' · ').slice(0, 24), L, y);

    /* 分隔线 */
    y += 30;
    ctx.strokeStyle = HAIR; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();

    /* 冲煮信息 */
    y += 54;
    const gramsText = fmtG(tx.grams);
    ctx.font = `700 48px ${NUM}`;
    ctx.fillStyle = ACCENT_DEEP;
    ctx.fillText(gramsText, L, y);
    const gramsW = ctx.measureText(gramsText).width;
    ctx.font = `600 19px ${SERIF}`;
    ctx.fillStyle = INK3;
    const unitX = L + gramsW + 5;
    ctx.fillText('g', unitX, y - 2);
    const unitW = ctx.measureText('g').width;
    ctx.font = `17px ${SERIF}`;
    ctx.fillStyle = INK2;
    ctx.fillText(tx.type === 'brew' ? '冲煮' : tx.type === 'share' ? '分豆' : '修正', unitX + unitW + 24, y - 7);
    if (metaLines.length) {
      y += 38;
      ctx.font = `14px ${SERIF}`;
      ctx.fillStyle = INK2;
      for (const ln of metaLines) { ctx.fillText(ln, L, y); y += 27; }
    }
    if (noteLines.length) {
      y += 34;
      ctx.font = `14px ${SERIF}`;
      ctx.fillStyle = INK2;
      for (const ln of noteLines) { ctx.fillText(ln, L, y); y += 29; }
    }

    /* 评分区 */
    y += 34;
    ctx.strokeStyle = HAIR;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
    y += 34;
    ctx.font = `600 13px ${SERIF}`;
    ctx.fillStyle = INK3;
    ctx.fillText('本 次 风 味 评 分', L, y);
    if (hasRate) {
      const radarCy = y + 158;
      drawRadar(ctx, L + 136, radarCy, 104, score);
      /* 右侧分维列表（数字基线 +2 补偿 Playfair 视觉重心偏上） */
      let ly = y + 30;
      RATING_DIMS.forEach((d) => {
        const v = score[d.key] || 0;
        ctx.font = `15px ${SERIF}`; ctx.textAlign = 'left'; ctx.fillStyle = INK2;
        ctx.fillText(d.label, L + 300, ly + 5);
        ctx.fillStyle = '#EFE7D9';
        roundRect(ctx, L + 360, ly - 6, 220, 10, 5); ctx.fill();
        ctx.fillStyle = ACCENT;
        roundRect(ctx, L + 360, ly - 6, Math.max(6, 220 * Math.min(v, 10) / 10), 10, 5); ctx.fill();
        ctx.font = `700 19px ${NUM}`; ctx.fillStyle = ACCENT_DEEP;
        ctx.fillText(String(v), L + 596, ly + 8);
        ly += 40;
      });
      /* 本次得分：独立成行，居中于整卡内容区（与雷达图呼应的收尾焦点） */
      const bigText = String(score.overall);
      ctx.font = `700 56px ${NUM}`;
      const rowCx = (L + R) / 2;
      ctx.textAlign = 'center';
      ctx.font = `600 13px ${SERIF}`; ctx.fillStyle = INK3;
      ctx.fillText('本 次 得 分', rowCx, ly + 26);
      ctx.font = `700 56px ${NUM}`; ctx.fillStyle = INK;
      ctx.fillText(bigText, rowCx, ly + 88);
      ctx.textAlign = 'left';
      y = Math.max(ly + 96, radarCy + 146);
    } else {
      y += 48;
      ctx.font = `15px ${SERIF}`;
      ctx.fillStyle = INK2;
      ctx.fillText('本次未评分', L, y);
    }

    /* 页脚紧随内容，保留呼吸感但不制造无效空白。 */
    ctx.textAlign = 'right';
    ctx.font = `12px ${SERIF}`;
    ctx.fillStyle = INK3;
    ctx.fillText('鉴豆 · 咖啡豆管家', R, H - PAD - 20);
    ctx.textAlign = 'left';

    const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
    if (!blob) { toast('图片生成失败', 'err'); return; }
    const filename = `jiandou-${(bean.name || '豆子').replace(/[\\/:*?"<>|\s]/g, '')}-${tx.date}.png`;
    /* 点击后直接下载到本机，不再经过系统分享面板。 */
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('图片已保存到本机 🖼', 'ok');
  } catch (e) {
    toast('导出失败：' + e.message, 'err');
  }
}
