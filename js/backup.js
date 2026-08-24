/* 鉴豆 · 数据备份：导出 / 导入 / 清空 + 本地镜像保险箱（数据仅存本机，请定期导出） */
import { db } from './db.js';
import { toast, confirmBox } from './ui.js';
import { clearSession } from './sync.js';

/* ---------- 本地镜像保险箱 ----------
   每次页面渲染后把档案+流水+器具快照写入 localStorage（不含照片，仅几 KB～几百 KB）。
   若 IndexedDB 被系统清理/异常清空，下次打开可一键还原。 */
const MIRROR_KEY = 'jiandou-mirror';

export async function mirrorSnapshot() {
  try {
    const beans = await db.beans.all();
    const txs = await db.txs.all();
    const equip = await db.equip.all();
    const prev = readMirror();
    /* 关键：绝不用空数据覆盖非空镜像（那正是数据丢失后需要救命的时刻） */
    const mirrorBeans = !beans.length && prev?.beans?.length ? prev.beans : beans;
    const mirrorTxs = !beans.length && prev?.beans?.length ? (prev.txs || []) : txs;
    const mirrorEquip = !equip.length && prev?.equip?.length ? prev.equip : equip;
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ t: Date.now(), beans: mirrorBeans, txs: mirrorTxs, equip: mirrorEquip }));
  } catch (_) { /* 存储满等异常时静默跳过 */ }
}

export function readMirror() {
  try { return JSON.parse(localStorage.getItem(MIRROR_KEY) || 'null'); }
  catch (_) { return null; }
}

export async function restoreFromMirror() {
  const m = readMirror();
  if (!m || (!(m.beans || []).length && !(m.equip || []).length)) { toast('没有可恢复的镜像数据', 'err'); return false; }
  const cur = await db.beans.all();
  const curEquip = await db.equip.all();
  if (cur.length || curEquip.length) {
    const yes = await confirmBox('恢复镜像数据？',
      `镜像含 ${(m.beans || []).length} 份档案 · ${(m.txs || []).length} 笔流水 · ${(m.equip || []).length} 件器具（快照时间 ${new Date(m.t).toLocaleString('zh-CN')}），将与本机 ${cur.length} 份档案 · ${curEquip.length} 件器具合并，同 ID 以镜像为准`);
    if (!yes) return false;
  }
  for (const b of m.beans || []) await db.beans.put(b);
  for (const t of m.txs || []) await db.txs.put(t);
  for (const item of m.equip || []) await db.equip.put(item);
  toast(`已恢复 ${(m.beans || []).length} 份档案 · ${(m.equip || []).length} 件器具 🛟`, 'ok');
  location.hash = '#/';
  setTimeout(() => location.reload(), 400);
  return true;
}

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
  const equip = await db.equip.all();
  if (!beans.length && !equip.length) { toast('还没有数据可备份', 'err'); return; }

  const photos = {};
  for (const b of beans) {
    if (b.photoId) {
      const blob = await db.photos.get(b.photoId);
      if (blob) photos[b.photoId] = await blobToDataURL(blob);
    }
  }
  const payload = {
    app: 'jiandou', ver: 2,
    exportedAt: new Date().toISOString(),
    beans, txs, equip, photos,
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
  await db.settings.set('lastBackupAt', Date.now());
  toast(`已导出 ${beans.length} 份档案 · ${equip.length} 件器具`, 'ok');
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
  const oldEquip = await db.equip.all();
  const yes = await confirmBox(
    '导入备份？',
    `备份含 ${data.beans.length} 份档案、${(data.txs || []).length} 笔流水、${(data.equip || []).length} 件器具${oldBeans.length || oldEquip.length ? `，将与现有 ${oldBeans.length} 份档案、${oldEquip.length} 件器具合并（同 ID 以备份为准）` : ''}`
  );
  if (!yes) return;

  try {
    for (const [id, dataURL] of Object.entries(data.photos || {})) {
      await db.photos.putBlob(id, await dataURLToBlob(dataURL));
    }
    for (const b of data.beans) await db.beans.put(b);
    for (const t of data.txs || []) await db.txs.put(t);
    for (const item of data.equip || []) await db.equip.put(item);
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
  for (const item of await db.equip.all()) await db.equip.del(item.id);
  localStorage.removeItem(MIRROR_KEY);
  clearSession();
  toast('已清空');
  location.hash = '#/';
  setTimeout(() => location.reload(), 400);
}
