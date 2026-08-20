/* 鉴豆 · 器具库：壶/滤杯/滤纸/磨豆机，一次录入多次使用；点星设默认，冲煮时自动带入 */
import { db } from '../db.js';
import { uid, esc } from '../util.js';
import { toast, vibrate, sheet, confirmBox } from '../ui.js';

const CATS = [
  { key: 'kettle',  label: '壶',     hint: '手冲壶 / 温控壶' },
  { key: 'dripper', label: '滤杯',   hint: 'V60 / 蛋糕杯 / 智能杯' },
  { key: 'paper',   label: '滤纸',   hint: 'Hario 01 / 漂白 / 原味' },
  { key: 'grinder', label: '磨豆机', hint: 'C40 / 1Zpresso …' },
];

export async function render(view) {
  view.innerHTML = `
    <div class="page-head">
      <div class="page-title">器具</div>
      <div class="page-sub">你的冲煮装备库 · 点 ★ 设为默认，冲煮时自动带入</div>
    </div>
    <div id="eq-body"></div>`;

  const body = view.querySelector('#eq-body');
  await draw(body);
}

async function draw(body) {
  const items = await db.equip.all();
  body.innerHTML = CATS.map((cat) => {
    /* 组内排序：★默认置顶，其余按录入时间正序（新增的排在栏目末尾） */
    const list = items.filter((i) => i.cat === cat.key)
      .sort((a, b) => ((b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
        || ((a.createdAt || 0) - (b.createdAt || 0))
        || String(a.id).localeCompare(String(b.id)));
    const rows = list.length
      ? list.map((i) => `
        <div class="eq-item" data-id="${i.id}">
          <span class="eq-name">${esc(i.name)}</span>
          <button class="eq-star ${i.isDefault ? 'on' : ''}" data-act="default" title="设为默认">${i.isDefault ? '★' : '☆'}</button>
          <button class="eq-del" data-act="del" title="删除">✕</button>
        </div>`).join('')
      : `<div class="eq-item"><span class="eq-name muted" style="font-size:12.5px;">${cat.hint}，还没录入</span></div>`;
    return `
      <div class="card">
        <div class="card-title"><b>${cat.label}</b><span>${list.length} 件</span></div>
        ${rows}
        <div class="eq-add">
          <input type="text" data-cat="${cat.key}" placeholder="添加${cat.label}，如 ${cat.hint.split(' / ')[0]}" maxlength="24" enterkeyhint="done"/>
          <button class="btn soft sm" data-act="add" data-cat="${cat.key}">添加</button>
        </div>
      </div>`;
  }).join('');

  /* 添加（内联输入行直接添加，首件自动设为默认） */
  const addItem = async (cat, name) => {
    name = (name || '').trim();
    if (!name) { toast('请输入名称', 'err'); return; }
    const exist = items.filter((i) => i.cat === cat);
    await db.equip.put({ id: uid(), cat, name, isDefault: exist.length === 0, createdAt: Date.now() });
    vibrate();
    toast('已添加', 'ok');
    draw(body);
  };
  body.querySelectorAll('[data-act="add"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = body.querySelector(`.eq-add input[data-cat="${btn.dataset.cat}"]`);
      addItem(btn.dataset.cat, input.value);
    });
  });
  body.querySelectorAll('.eq-add input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addItem(input.dataset.cat, input.value); }
    });
  });

  /* 行操作：设默认 / 删除 / 长按(右键)重命名 */
  body.querySelectorAll('.eq-item[data-id]').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-act="default"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = items.find((i) => i.id === id);
      const was = item.isDefault;
      for (const i of items.filter((x) => x.cat === item.cat)) {
        i.isDefault = i.id === id ? !was : false;
        await db.equip.put(i);
      }
      vibrate();
      toast(was ? '已取消默认' : `「${item.name}」设为默认`, 'ok');
      draw(body);
    });
    row.querySelector('[data-act="del"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = items.find((i) => i.id === id);
      const yes = await confirmBox(`删除「${esc(item.name)}」？`, '已有的冲煮记录不受影响', { okText: '删除', danger: true });
      if (!yes) return;
      await db.equip.del(id);
      toast('已删除');
      draw(body);
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const item = items.find((i) => i.id === id);
      addOrRename(body, item.cat, null, item);
    });
  });
}

async function addOrRename(body, cat, preset, item = null) {
  const catMeta = CATS.find((c) => c.key === cat);
  const isRename = !!item;
  const html = `
    <div class="field" style="margin:0;">
      <label>${isRename ? `重命名「${esc(item.name)}」` : catMeta.label + '名称'}</label>
      <input type="text" id="eq-name" placeholder="如 ${catMeta.hint.split(' / ')[0]}" maxlength="24" value="${preset || (isRename ? esc(item.name) : '')}"/>
    </div>
    <button class="btn primary block mt-14" id="eq-save" style="margin-top:14px;">${isRename ? '保存' : '添加'}</button>`;

  sheet({
    title: isRename ? '✏️ 重命名' : `＋ 添加${catMeta.label}`,
    html,
    onMount(el, close) {
      const input = el.querySelector('#eq-name');
      input.focus();
      el.querySelector('#eq-save').onclick = async () => {
        const name = input.value.trim();
        if (!name) { toast('请输入名称', 'err'); return; }
        if (isRename) {
          item.name = name;
          await db.equip.put(item);
          toast('已保存', 'ok');
        } else {
          const exist = (await db.equip.all()).filter((i) => i.cat === cat);
          await db.equip.put({ id: uid(), cat, name, isDefault: exist.length === 0 });
          toast(`已添加${catMeta.label}`, 'ok');
        }
        close();
        draw(body);
      };
    },
  });
}
