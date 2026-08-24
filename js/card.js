/* 鉴豆 · 流水分享卡片：单笔记录 + 当前平均评分 → Canvas 绘制 → PNG 保存 */
import { RATING_DIMS, avgRatings, fmtG, fmtDuration } from './util.js';
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
  /* 维度标签 */
  ctx.font = `12px ${SERIF}`;
  ctx.fillStyle = INK2;
  ctx.textAlign = 'center';
  dims.forEach((d, i) => {
    const [x, y] = pt(i, R + 18);
    ctx.fillText(d.label, x, y + 4);
  });
}

export async function exportTxCard(bean, tx, txs) {
  try {
    await document.fonts.ready;
    const W = 750, PAD = 26;
    const avg = avgRatings(txs);
    const p = tx.params || {}, eq = tx.equip || {};
    const hasRate = !!avg;

    /* 6 维雷达图+分项需要足够纵向空间，避免较长感受压到页脚 */
    const H = hasRate ? 920 : (tx.note ? 520 : 450);

    const scale = 2;
    const cv = document.createElement('canvas');
    cv.width = W * scale; cv.height = H * scale;
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);

    /* 背景 + 卡片 */
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H);
    roundRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, 26);
    ctx.fillStyle = CARD; ctx.fill();
    const L = PAD + 30, R = W - PAD - 30;
    let y = PAD + 52;

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
    y += 46;
    ctx.font = `700 34px ${SERIF}`;
    ctx.fillStyle = INK;
    ctx.fillText((bean.name || '未命名').slice(0, 16), L, y);
    y += 30;
    ctx.font = `16px ${SERIF}`;
    ctx.fillStyle = INK2;
    ctx.fillText([bean.roaster, bean.origin].filter(Boolean).join(' · ').slice(0, 24), L, y);

    /* 分隔线 */
    y += 24;
    ctx.strokeStyle = HAIR; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();

    /* 冲煮信息 */
    y += 42;
    ctx.font = `700 40px ${NUM}`;
    ctx.fillStyle = ACCENT_DEEP;
    ctx.fillText(fmtG(tx.grams) + 'g', L, y);
    ctx.font = `17px ${SERIF}`;
    ctx.fillStyle = INK;
    ctx.fillText(tx.type === 'brew' ? '冲煮' : tx.type === 'share' ? '分豆' : '修正', L + 118, y - 6);
    const ml = metaLine(tx);
    if (ml) {
      y += 30;
      ctx.font = `14px ${SERIF}`;
      ctx.fillStyle = INK2;
      for (const ln of wrapText(ctx, ml, R - L, 2)) { ctx.fillText(ln, L, y); y += 22; }
    }
    if (tx.note) {
      y += 26;
      ctx.font = `14px ${SERIF}`;
      ctx.fillStyle = INK2;
      for (const ln of wrapText(ctx, '「' + tx.note + '」', R - L, 2)) { ctx.fillText(ln, L, y); y += 22; }
    }

    /* 评分区 */
    if (hasRate) {
      y += 22;
      ctx.strokeStyle = HAIR;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      y += 26;
      ctx.font = `600 13px ${SERIF}`;
      ctx.fillStyle = INK3;
      ctx.fillText('风 味 评 分 · 平 均', L, y);
      const radarCy = y + 150;
      drawRadar(ctx, L + 128, radarCy, 104, avg);
      /* 右侧分维列表 */
      let ly = y + 24;
      RATING_DIMS.forEach((d) => {
        const v = avg[d.key] || 0;
        ctx.font = `15px ${SERIF}`; ctx.textAlign = 'left'; ctx.fillStyle = INK2;
        ctx.fillText(d.label, L + 300, ly + 5);
        ctx.fillStyle = '#EFE7D9';
        roundRect(ctx, L + 360, ly - 6, 220, 10, 5); ctx.fill();
        ctx.fillStyle = ACCENT;
        roundRect(ctx, L + 360, ly - 6, Math.max(6, 220 * Math.min(v, 10) / 10), 10, 5); ctx.fill();
        ctx.font = `700 19px ${NUM}`; ctx.fillStyle = ACCENT_DEEP;
        ctx.fillText(String(v), L + 596, ly + 6);
        ly += 38;
      });
      /* 整体均分 */
      ctx.font = `600 13px ${SERIF}`; ctx.fillStyle = INK3;
      ctx.fillText('整体均分', L + 300, ly + 16);
      ctx.font = `700 56px ${NUM}`; ctx.fillStyle = INK;
      ctx.fillText(String(avg.overall), L + 300, ly + 74);
      y = Math.max(ly + 86, radarCy + 138);
    }

    /* 页脚 */
    ctx.textAlign = 'right';
    ctx.font = `12px ${SERIF}`;
    ctx.fillStyle = INK3;
    ctx.fillText('鉴豆 · 咖啡豆管家', R, H - PAD - 22);
    ctx.textAlign = 'left';

    const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
    if (!blob) { toast('图片生成失败', 'err'); return; }
    const filename = `jiandou-${(bean.name || '豆子').replace(/[\\/:*?"<>|\s]/g, '')}-${tx.date}.png`;
    const file = new File([blob], filename, { type: 'image/png' });

    /* Android PWA 无权静默写入系统相册：优先打开系统分享面板，可直接选择相册/图片；不支持时退回下载目录。 */
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try {
        await navigator.share({ files: [file], title: `${bean.name || '咖啡豆'} · 冲煮记录` });
        toast('分享卡片已生成 🖼', 'ok');
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('卡片已保存到下载目录 🖼', 'ok');
  } catch (e) {
    toast('导出失败：' + e.message, 'err');
  }
}
