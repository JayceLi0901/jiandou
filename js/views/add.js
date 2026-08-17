/* 鉴豆 · 建档流程：拍照/选图 → OCR 识别预填 → 表单确认 → 保存 */
import { db, deleteBeanDeep } from '../db.js';
import { recognize } from '../ocr.js';
import { uid, todayStr, compressImage, esc } from '../util.js';
import { toast, vibrate, confirmBox } from '../ui.js';

const VARIETIES = ['瑰夏', '铁皮卡', '波旁', '尖身波旁', '卡杜拉', '卡杜艾', '帕卡马拉', '帕卡斯', '新世界', '摩卡', '象豆', '原生种', 'SL28', 'SL34', '74110', '74158', '希爪', 'Sidra', 'Java', 'Parainema'];
const PROCESSES = ['水洗', '日晒', '蜜处理', '厌氧发酵', '厌氧日晒', '厌氧水洗', '湿刨法', '半水洗', '二氧化碳浸渍', '酒桶发酵', '红酒处理'];

const REST_PRESETS = [15, 30, 45];

let st = null;

export async function render(view, params) {
  const editing = params && params.id ? await db.beans.get(params.id) : null;
  st = {
    editing,
    photoFile: null,       // 新选的照片（File）
    photoBlob: null,       // 压缩后
    photoId: editing ? editing.photoId : null, // 保留的旧照片
    restMode: editing ? (REST_PRESETS.includes(Number(editing.restDays)) ? String(editing.restDays) : 'custom') : '30',
    busy: false,
  };

  view.innerHTML = `
    <div class="page-head">
      <div class="page-title">${editing ? '编辑档案' : '拍照建档'}</div>
      <div class="page-sub">${editing ? '修改豆子档案信息（剩余克重在详情页用「修正」调整）' : '拍一张包装袋正面，识别后确认信息即可入库'}</div>
    </div>

    <div class="photo-box" id="photo-box">
      <div id="photo-empty" ${editing && editing.photoId ? 'hidden' : ''}>
        <div style="font-size:34px;margin-bottom:8px;">📷</div>
        <div style="font-weight:600;color:var(--ink-2);">拍摄 / 上传包装袋照片</div>
        <div class="muted" style="margin-top:4px;">用于 AI 识别与档案留档</div>
      </div>
      <img id="photo-img" hidden alt="包装照片"/>
      <div class="ocr-status" id="ocr-status" hidden></div>
    </div>
    <input type="file" id="photo-input" accept="image/*" capture="environment" hidden/>
    ${editing ? '' : `<div class="muted mt-8" style="margin-bottom:14px;"><a href="#/" id="skip-photo" style="color:var(--accent-deep);text-decoration:none;">跳过拍照，手动填写 →</a></div>`}

    <div class="form-card">
      <div class="field"><label>豆子名称 *</label>
        <input type="text" data-f="name" placeholder="如：翡翠庄园 红标瑰夏" maxlength="40"/></div>
      <div class="field-row">
        <div class="field"><label>烘焙商</label>
          <input type="text" data-f="roaster" placeholder="如：治光师" maxlength="30"/></div>
        <div class="field"><label>产地</label>
          <input type="text" data-f="origin" placeholder="如：巴拿马·波奎特" maxlength="30"/></div>
      </div>
      <div class="field-row">
        <div class="field"><label>庄园 / 处理厂</label>
          <input type="text" data-f="estate" placeholder="如：翡翠庄园" maxlength="30"/></div>
        <div class="field"><label>豆种</label>
          <input type="text" data-f="variety" placeholder="如：瑰夏" maxlength="30" list="dl-variety"/>
          <datalist id="dl-variety">${VARIETIES.map((v) => `<option value="${v}"/>`).join('')}</datalist></div>
      </div>
      <div class="field-row">
        <div class="field"><label>处理法</label>
          <input type="text" data-f="process" placeholder="如：日晒" maxlength="20" list="dl-process"/>
          <datalist id="dl-process">${PROCESSES.map((v) => `<option value="${v}"/>`).join('')}</datalist></div>
        <div class="field"><label>烘焙日期</label>
          <input type="date" data-f="roastDate" max="${todayStr()}"/></div>
      </div>
      <div class="field"><label>风味描述</label>
        <textarea data-f="flavors" placeholder="如：茉莉、柑橘、蜂蜜、红茶尾韵" maxlength="120"></textarea></div>
      <div class="field"><label>总克重（到手净重，克）*</label>
        <input type="number" data-f="totalWeight" inputmode="decimal" min="1" max="10000" step="0.1" placeholder="如 200"/>
        <div class="err-hint">请输入大于 0 的数字</div></div>

      <div class="field" style="margin-bottom:0;"><label>养豆天数</label>
        <div class="seg" id="rest-seg">
          ${REST_PRESETS.map((d) => `<button data-d="${d}">${d} 天</button>`).join('')}
          <button data-d="custom">自定义</button>
        </div>
        <div class="mt-8" id="rest-custom-wrap" hidden>
          <input type="number" id="rest-custom" inputmode="numeric" min="1" max="365" step="1" placeholder="输入 1~365 的整数"/>
          <div class="err-hint" id="rest-err" style="display:none;color:var(--danger);font-size:11.5px;margin-top:4px;">请输入 1~365 的整数天数</div>
        </div>
      </div>
    </div>

    <button class="btn primary block" id="save-btn">${editing ? '保存修改' : '入库建档'}</button>
    ${editing ? `<div class="mt-8"><button class="btn danger block sm" id="del-btn">删除这份档案</button></div>` : ''}
  `;

  const $ = (s) => view.querySelector(s);
  const box = $('#photo-box'), img = $('#photo-img'), input = $('#photo-input'), statusEl = $('#ocr-status');

  /* 编辑模式：预填 */
  if (editing) {
    for (const k of ['name', 'roaster', 'origin', 'estate', 'variety', 'process', 'flavors']) {
      $(`[data-f="${k}"]`).value = editing[k] || '';
    }
    $('[data-f="roastDate"]').value = editing.roastDate || '';
    $('[data-f="totalWeight"]').value = editing.totalWeight ?? '';
    if (editing.photoId) {
      const blob = await db.photos.get(editing.photoId);
      if (blob) { img.src = URL.createObjectURL(blob); img.hidden = false; $('#photo-empty').hidden = true; box.classList.add('has'); }
    }
  }

  /* 养豆天数分段 */
  const seg = $('#rest-seg'), customWrap = $('#rest-custom-wrap'), customInput = $('#rest-custom');
  function syncSeg() {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.d === st.restMode));
    customWrap.hidden = st.restMode !== 'custom';
    if (st.restMode === 'custom' && editing && editing.restDays) customInput.value = editing.restDays;
  }
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    st.restMode = b.dataset.d;
    $('#rest-err').style.display = 'none';
    syncSeg();
  });
  customInput.addEventListener('input', () => { $('#rest-err').style.display = 'none'; customInput.classList.remove('invalid'); });
  syncSeg();

  /* 拍照 / 选图 */
  box.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || st.busy) return;
    st.busy = true;
    try {
      st.photoBlob = await compressImage(file, 1280, 0.82);
      st.photoFile = new File([st.photoBlob], 'label.jpg', { type: 'image/jpeg' });
      img.src = URL.createObjectURL(st.photoBlob);
      img.hidden = false; $('#photo-empty').hidden = true; box.classList.add('has');
      vibrate();
      await runOCR(st.photoFile, statusEl);
    } catch (e) {
      toast('照片处理失败：' + e.message, 'err');
    }
    st.busy = false;
  });

  async function runOCR(file, statusEl) {
    statusEl.hidden = false;
    statusEl.innerHTML = `<div class="spinner"></div><span id="ocr-txt">准备识别…</span>`;
    try {
      const cfg = {
        engine: await db.settings.get('engine', 'local'),
        apiKey: await db.settings.get('apiKey', ''),
        apiBase: await db.settings.get('apiBase', 'https://open.bigmodel.cn/api/paas/v4'),
        model: await db.settings.get('model', 'glm-4v-flash'),
      };
      const fields = await recognize(file, cfg, (msg) => {
        statusEl.querySelector('#ocr-txt').textContent = msg;
      });
      let filled = 0;
      for (const [k, v] of Object.entries(fields || {})) {
        const el = view.querySelector(`[data-f="${k}"]`);
        if (el && v != null && v !== '' && !el.value) {
          el.value = k === 'totalWeight' ? v : String(v);
          el.style.transition = 'background .8s';
          el.style.background = 'var(--accent-ghost)';
          setTimeout(() => { el.style.background = ''; }, 1600);
          filled++;
        }
      }
      const n = Object.values(fields || {}).filter((v) => v != null && v !== '').length;
      statusEl.innerHTML = `<span>${filled ? `✓ 已识别 ${n} 项，已自动填入 ${filled} 项空位` : '未能提取出有效字段，请手动填写'}</span>`;
      if (n) toast('识别完成，请核对信息', 'ok');
    } catch (e) {
      statusEl.innerHTML = `<span>识别失败（${esc(e.message)}），可手动填写或稍后重试</span>`;
    }
  }

  $('#skip-photo')?.addEventListener('click', (e) => { e.preventDefault(); $('#photo-box').scrollIntoView({ behavior: 'smooth', block: 'center' }); });

  /* 删除（编辑模式） */
  $('#del-btn')?.addEventListener('click', async () => {
    const yes = await confirmBox('删除这份档案？', '档案、冲煮流水与照片都会清除，无法恢复', { okText: '删除', danger: true });
    if (!yes) return;
    await deleteBeanDeep(st.editing);
    toast('已删除');
    location.hash = '#/';
  });

  /* 保存 */
  $('#save-btn').addEventListener('click', async () => {
    const get = (k) => view.querySelector(`[data-f="${k}"]`).value.trim();
    const name = get('name');
    const total = parseFloat(get('totalWeight'));
    let ok = true;
    view.querySelector('[data-f="name"]').classList.toggle('invalid', !name);
    const twEl = view.querySelector('[data-f="totalWeight"]');
    twEl.classList.toggle('invalid', !(total > 0));
    if (!name || !(total > 0)) ok = false;

    let restDays;
    if (st.restMode === 'custom') {
      restDays = parseInt(customInput.value, 10);
      if (!(restDays >= 1 && restDays <= 365)) {
        customInput.classList.add('invalid');
        $('#rest-err').style.display = 'block';
        ok = false;
      } else customInput.classList.remove('invalid');
    } else restDays = Number(st.restMode);

    if (!ok) { toast('请检查标红的项目', 'err'); return; }

    const btn = $('#save-btn');
    btn.disabled = true; btn.textContent = '保存中…';
    try {
      if (st.photoBlob) {
        if (st.photoId) await db.photos.del(st.photoId);
        st.photoId = await db.photos.put(st.photoBlob);
      }
      const now = Date.now();
      const bean = st.editing
        ? { ...st.editing, ...{} }
        : { id: uid(), createdAt: now, remainingWeight: total, archived: false };
      Object.assign(bean, {
        name, roaster: get('roaster'), origin: get('origin'), estate: get('estate'),
        variety: get('variety'), process: get('process'), roastDate: get('roastDate'),
        flavors: get('flavors'), totalWeight: total, restDays, photoId: st.photoId,
        updatedAt: now,
      });
      await db.beans.put(bean);
      vibrate(12);
      toast(st.editing ? '已保存' : `「${name}」已入库`, 'ok');
      location.hash = '#/bean/' + bean.id;
    } catch (e) {
      toast('保存失败：' + e.message, 'err');
      btn.disabled = false; btn.textContent = st.editing ? '保存修改' : '入库建档';
    }
  });
}
