/* 鉴豆 · 数据备份：导出 / 导入 / 清空（数据仅存本机，请定期导出） */
import { db } from './db.js';
import { toast, confirmBox } from './ui.js';

const blobToDataURL = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

const dataURLToBlob = async (url) => (await fetch(url)).blob();

export async function exportBackup() {
  const beans = await db.beans.all();
  const txs = await db.txs.all();
  if (!beans.length) { toast('还没有数据可备份', 'err'); return; }

  const photos = {};
  for (const b of beans) {
    if (b.photoId) {
      const blob = await db.photos.get(b.photoId);
      if (blob) photos[b.photoId] = await blobToDataURL(blob);
    }
  }
  const payload = {
    app: 'jiandou', ver: 1,
    exportedAt: new Date().toISOString(),
    beans, txs, photos,
    settings: {
      engine: await db.settings.get('engine', 'local'),
      apiKey: await db.settings.get('apiKey', ''),
      apiBase: await db.settings.get('apiBase', ''),
      model: await db.settings.get('model', ''),
    },
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `jiandou-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`已导出 ${beans.length} 份档案`, 'ok');
}

export async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { toast('文件不是有效的备份', 'err'); return; }
  if (data.app !== 'jiandou' || !Array.isArray(data.beans)) {
    toast('这不是鉴豆的备份文件', 'err');
    return;
  }
  const oldBeans = await db.beans.all();
  const yes = await confirmBox(
    '导入备份？',
    `备份含 ${data.beans.length} 份档案、${(data.txs || []).length} 笔流水${oldBeans.length ? `，将与现有 ${oldBeans.length} 份档案合并（同 ID 以备份为准）` : ''}`
  );
  if (!yes) return;

  try {
    for (const [id, dataURL] of Object.entries(data.photos || {})) {
      await db.photos.putBlob(id, await dataURLToBlob(dataURL));
    }
    for (const b of data.beans) await db.beans.put(b);
    for (const t of data.txs || []) await db.txs.put(t);
    const s = data.settings || {};
    if (s.engine) await db.settings.set('engine', s.engine);
    if (s.apiBase) await db.settings.set('apiBase', s.apiBase);
    if (s.model) await db.settings.set('model', s.model);
    if (s.apiKey) await db.settings.set('apiKey', s.apiKey);
    toast('备份已导入', 'ok');
    location.hash = '#/';
    setTimeout(() => location.reload(), 400);
  } catch (e) {
    toast('导入失败：' + e.message, 'err');
  }
}

export async function wipeAll() {
  const yes = await confirmBox('清空所有数据？', '所有豆子档案、流水、照片、设置都会删除，且无法恢复。建议先导出备份。', { okText: '全部清空', danger: true });
  if (!yes) return;
  const again = await confirmBox('最后确认', '真的要清空吗？此操作不可撤销。', { okText: '我确定', danger: true });
  if (!again) return;
  const beans = await db.beans.all();
  for (const b of beans) {
    const txs = await db.txs.byBean(b.id);
    for (const t of txs) await db.txs.del(t.id);
    await db.photos.del(b.photoId);
    await db.beans.del(b.id);
  }
  toast('已清空');
  location.hash = '#/';
  setTimeout(() => location.reload(), 400);
}
