/* 鉴豆 · 应用内日期选择器：左右切月，点标题直达任意年月 */
import { todayStr, parseDate, esc } from './util.js';
import { sheet, vibrate } from './ui.js';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * datePickerSheet({ value, max, title, clearable })
 * @returns {Promise<string|null>} 'YYYY-MM-DD'；clearable 时可通过「清除」返回 ''
 */
export function datePickerSheet({ value = '', max = todayStr(), title = '选择日期', clearable = false } = {}) {
  return new Promise((resolve) => {
    const init = parseDate(value) || new Date();
    const maxD = parseDate(max);
    let y = init.getFullYear(), m = init.getMonth();
    const sel = value || '';
    let settled = false;
    let close = () => {};
    const done = (v) => { settled = true; close(); resolve(v); };

    sheet({
      title: esc(title),
      html: `<div id="dp"></div>
        <div style="display:flex;gap:10px;margin-top:6px;">
          <button class="btn ghost sm" style="flex:1;" id="dp-today">今天</button>
          ${clearable ? `<button class="btn ghost sm" style="flex:1;" id="dp-clear">清除</button>` : ''}
        </div>`,
      onMount(el, closeFn) {
        close = closeFn;
        const box = el.querySelector('#dp');
        el.querySelector('#dp-today').onclick = () => done(todayStr());
        const clearBtn = el.querySelector('#dp-clear');
        if (clearBtn) clearBtn.onclick = () => done('');

        const render = () => { drawCalendar(box); };
        render();

        function ymStr() { return `${y}年${m + 1}月`; }

        function drawCalendar(box) {
          box.innerHTML = `
            <div class="dp-head">
              <button class="dp-nav" data-nav="-1" aria-label="上月">‹</button>
              <button class="dp-title" data-ym="1">${ymStr()}</button>
              <button class="dp-nav" data-nav="1" aria-label="下月">›</button>
            </div>
            <div class="dp-week">${WEEK.map((w) => `<span>${w}</span>`).join('')}</div>
            <div class="dp-grid">${dayCells()}</div>`;

          box.querySelectorAll('[data-nav]').forEach((b) => {
            b.onclick = () => {
              m += Number(b.dataset.nav);
              if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
              vibrate(4);
              render();
            };
          });
          box.querySelector('[data-ym]').onclick = () => { drawYearMonth(box); };
          box.querySelectorAll('[data-day]').forEach((b) => {
            b.onclick = () => done(b.dataset.day);
          });
        }

        function drawYearMonth(box) {
          box.innerHTML = `
            <div class="dp-head">
              <button class="dp-nav" data-yy="-1" aria-label="上一年">‹</button>
              <button class="dp-title">${y}年</button>
              <button class="dp-nav" data-yy="1" aria-label="下一年">›</button>
            </div>
            <div class="dp-months">
              ${Array.from({ length: 12 }, (_, i) =>
                `<button class="dp-m ${i === m ? 'on' : ''}" data-m="${i}">${i + 1}月</button>`).join('')}
            </div>`;
          box.querySelectorAll('[data-yy]').forEach((b) => {
            b.onclick = () => { y += Number(b.dataset.yy); vibrate(4); drawYearMonth(box); };
          });
          box.querySelectorAll('[data-m]').forEach((b) => {
            b.onclick = () => { m = Number(b.dataset.m); vibrate(4); drawCalendar(box); };
          });
        }

        function dayCells() {
          const first = new Date(y, m, 1).getDay();
          const days = new Date(y, m + 1, 0).getDate();
          const today = todayStr();
          let cells = '';
          for (let i = 0; i < first; i++) cells += `<span class="dp-d muted"></span>`;
          for (let d = 1; d <= days; d++) {
            const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const future = maxD && ds > max;
            const cls = ['dp-d', ds === sel ? 'sel' : '', ds === today ? 'today' : '', future ? 'dis' : ''].filter(Boolean).join(' ');
            cells += `<button class="${cls}" data-day="${ds}" ${future ? 'disabled' : ''}>${d}</button>`;
          }
          return cells;
        }
      },
      onClose: () => { if (!settled) resolve(null); },
    });
  });
}
