/* 鉴豆 · IndexedDB 本地数据层
   stores: beans(id) / txs(id, index:beanId) / photos(id) / settings(key)
   所有数据仅存手机本机 */
import { calcRemaining, uid } from './util.js';

const DB_NAME = 'jiandou';
const DB_VER = 2;

const ready = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VER);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('beans')) db.createObjectStore('beans', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('txs')) {
      const s = db.createObjectStore('txs', { keyPath: 'id' });
      s.createIndex('beanId', 'beanId', { unique: false });
    }
    if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    if (!db.objectStoreNames.contains('equip')) db.createObjectStore('equip', { keyPath: 'id' });
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function tx(store, mode) {
  return ready.then((db) => db.transaction(store, mode).objectStore(store));
}

function wrap(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const db = {
  beans: {
    async all() { return wrap((await tx('beans', 'readonly')).getAll()); },
    async get(id) { return wrap((await tx('beans', 'readonly')).get(id)); },
    async put(bean) { return wrap((await tx('beans', 'readwrite')).put(bean)); },
    async del(id) { return wrap((await tx('beans', 'readwrite')).delete(id)); },
  },
  txs: {
    async byBean(beanId) {
      const store = await tx('txs', 'readonly');
      return wrap(store.index('beanId').getAll(beanId));
    },
    async all() { return wrap((await tx('txs', 'readonly')).getAll()); },
    async put(t) { return wrap((await tx('txs', 'readwrite')).put(t)); },
    async del(id) { return wrap((await tx('txs', 'readwrite')).delete(id)); },
  },
  photos: {
    async put(blob) {
      const id = uid();
      await wrap((await tx('photos', 'readwrite')).put({ id, blob, createdAt: Date.now() }));
      return id;
    },
    async putBlob(id, blob) {
      await wrap((await tx('photos', 'readwrite')).put({ id, blob, createdAt: Date.now() }));
    },
    async get(id) {
      if (!id) return null;
      const rec = await wrap((await tx('photos', 'readonly')).get(id));
      return rec ? rec.blob : null;
    },
    async del(id) {
      if (!id) return;
      await wrap((await tx('photos', 'readwrite')).delete(id));
    },
  },
  settings: {
    async get(key, def = null) {
      const rec = await wrap((await tx('settings', 'readonly')).get(key));
      return rec ? rec.value : def;
    },
    async set(key, value) {
      await wrap((await tx('settings', 'readwrite')).put({ key, value }));
    },
  },
  /* 器具库：壶/滤杯/滤纸/磨豆机，一次录入多次使用 */
  equip: {
    async all() { return wrap((await tx('equip', 'readonly')).getAll()); },
    async put(item) { return wrap((await tx('equip', 'readwrite')).put(item)); },
    async del(id) { return wrap((await tx('equip', 'readwrite')).delete(id)); },
  },
};

/* 记一笔流水并同步豆子剩余克重 */
export async function addTx(beanId, data) {
  const bean = await db.beans.get(beanId);
  if (!bean) throw new Error('豆子不存在');
  const t = {
    id: uid(),
    beanId,
    createdAt: Date.now(),
    date: data.date,
    type: data.type,           // brew | share | adjust
    grams: Number(data.grams), // adjust 为带符号增量
    note: data.note || '',
    rating: data.rating || null,
    equip: data.equip || null,     // {kettle,dripper,paper,grinder} 名称
    params: data.params || null,   // {temp,water,ratio,grind} 冲煮参数
  };
  await db.txs.put(t);
  const all = await db.txs.byBean(beanId);
  bean.remainingWeight = calcRemaining(bean, all);
  bean.updatedAt = Date.now();
  await db.beans.put(bean);
  return { tx: t, bean };
}

/* 豆子详情聚合 */
export async function getBeanFull(id) {
  const bean = await db.beans.get(id);
  if (!bean) return null;
  const txs = (await db.txs.byBean(id)).sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0)
  );
  return { bean, txs };
}

/* 删除豆子（连同流水与照片） */
export async function deleteBeanDeep(bean) {
  const txs = await db.txs.byBean(bean.id);
  for (const t of txs) await db.txs.del(t.id);
  await db.photos.del(bean.photoId);
  await db.beans.del(bean.id);
}
