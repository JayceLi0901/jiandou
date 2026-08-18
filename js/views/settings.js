/* 鉴豆 · 设置：识别引擎（本地/云端）、数据备份、关于 */
import { db } from '../db.js';
import { exportBackup, importBackup, wipeAll } from '../backup.js';
import { toast } from '../ui.js';

export async function render(view) {
  const engine = await db.settings.get('engine', 'local');
  const apiKey = await db.settings.get('apiKey', '');
  const apiBase = await db.settings.get('apiBase', 'https://open.bigmodel.cn/api/paas/v4');
  const model = await db.settings.get('model', 'glm-4v-flash');
  const beanCount = (await db.beans.all()).length;
  const txCount = (await db.txs.all()).length;

  view.innerHTML = `
    <div class="page-head">
      <div class="page-title">设置</div>
      <div class="page-sub">识别引擎与数据管理</div>
    </div>

    <div class="set-group">
      <div class="group-label" style="margin-top:0;">识别引擎</div>
      <div class="card" style="margin-bottom:0;">
        <div class="seg" id="engine-seg">
          <button data-e="local" class="${engine === 'local' ? 'on' : ''}">📱 本地离线</button>
          <button data-e="cloud" class="${engine === 'cloud' ? 'on' : ''}">☁️ 云端 AI</button>
        </div>
        <div class="muted" style="text-align:left;margin-top:10px;line-height:1.7;" id="engine-hint">
          ${engine === 'local'
            ? '本地识别完全离线、免费。咖啡包装设计花哨时识别率有限，识别不准的字段请手动修正。'
            : '使用视觉大模型识别，准确率更高。需要联网与 API Key，单次费用极低；失败时自动回退本地识别。'}
        </div>

        <div id="cloud-cfg" ${engine === 'cloud' ? '' : 'hidden'} style="margin-top:14px;">
          <div class="field"><label>API 地址（OpenAI 兼容接口）</label>
            <input type="text" id="cfg-base" value="${apiBase}" placeholder="https://open.bigmodel.cn/api/paas/v4"/></div>
          <div class="field"><label>模型</label>
            <input type="text" id="cfg-model" value="${model}" placeholder="glm-4v-flash"/></div>
          <div class="field"><label>API Key</label>
            <input type="password" id="cfg-key" value="${apiKey}" placeholder="粘贴你的 Key（仅保存在本机）"/></div>
          <button class="btn soft block sm" id="cfg-save">保存识别配置</button>
          <div class="muted" style="margin-top:8px;">以智谱为例：open.bigmodel.cn 的 glm-4v-flash 模型目前免费</div>
        </div>
      </div>
    </div>

    <div class="set-group">
      <div class="group-label">数据（仅存本机）</div>
      <div class="set-row solo" id="row-export" style="cursor:pointer;">
        <div class="set-main"><div class="set-title">导出备份</div><div class="set-desc">生成 JSON 备份文件，建议定期导出</div></div>
        <span class="set-arrow">›</span>
      </div>
      <div style="height:1px;background:var(--hairline);"></div>
      <div class="set-row solo" id="row-import" style="cursor:pointer;border-radius:0;">
        <div class="set-main"><div class="set-title">导入备份</div><div class="set-desc">从备份文件恢复（与现有数据合并）</div></div>
        <span class="set-arrow">›</span>
      </div>
      <div style="height:1px;background:var(--hairline);"></div>
      <div class="set-row solo" id="row-wipe" style="cursor:pointer;">
        <div class="set-main"><div class="set-title" style="color:var(--danger);">清空所有数据</div><div class="set-desc">删除全部档案、流水与照片</div></div>
        <span class="set-arrow">›</span>
      </div>
      <input type="file" id="import-input" accept="application/json,.json" hidden/>
    </div>

    <div class="set-group">
      <div class="group-label">关于</div>
      <div class="card" style="margin-bottom:0;">
        <div class="kv"><span class="k">版本</span><span class="v">鉴豆 v1.3.1</span></div>
        <div class="kv"><span class="k">本机数据</span><span class="v">${beanCount} 份档案 · ${txCount} 笔流水</span></div>
        <div class="kv"><span class="k">数据存储</span><span class="v">全部在本机（IndexedDB）</span></div>
        <div class="kv"><span class="k">隐私</span><span class="v">无服务器、无账号、无追踪</span></div>
      </div>
    </div>`;

  const $ = (s) => view.querySelector(s);

  /* 引擎切换 */
  $('#engine-seg').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const val = btn.dataset.e;
    await db.settings.set('engine', val);
    $('#engine-seg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    $('#cloud-cfg').hidden = val !== 'cloud';
    $('#engine-hint').textContent = val === 'local'
      ? '本地识别完全离线、免费。咖啡包装设计花哨时识别率有限，识别不准的字段请手动修正。'
      : '使用视觉大模型识别，准确率更高。需要联网与 API Key，单次费用极低；失败时自动回退本地识别。';
    toast(val === 'cloud' ? '已切换到云端 AI 识别' : '已切换到本地离线识别', 'ok');
  });

  $('#cfg-save')?.addEventListener('click', async () => {
    await db.settings.set('apiBase', $('#cfg-base').value.trim() || 'https://open.bigmodel.cn/api/paas/v4');
    await db.settings.set('model', $('#cfg-model').value.trim() || 'glm-4v-flash');
    await db.settings.set('apiKey', $('#cfg-key').value.trim());
    toast('识别配置已保存', 'ok');
  });

  /* 备份 */
  $('#row-export').addEventListener('click', exportBackup);
  $('#row-import').addEventListener('click', () => $('#import-input').click());
  $('#import-input').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) importBackup(f);
  });
  $('#row-wipe').addEventListener('click', wipeAll);
}
