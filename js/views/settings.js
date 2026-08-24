/* 鉴豆 · 设置：识别引擎（本地/云端）、数据备份、关于 */
import { db } from '../db.js';
import { exportBackup, importBackup, wipeAll, readMirror, restoreFromMirror } from '../backup.js';
import { getSession, registerAccount, loginAccount, pushData, pullData, clearSession } from '../sync.js';
import { toast, confirmBox } from '../ui.js';
import { esc } from '../util.js';

export async function render(view) {
  const engine = await db.settings.get('engine', 'local');
  const apiKey = await db.settings.get('apiKey', '');
  const apiBase = await db.settings.get('apiBase', 'https://open.bigmodel.cn/api/paas/v4');
  const model = await db.settings.get('model', 'glm-4v-flash');
  const beanCount = (await db.beans.all()).length;
  const txCount = (await db.txs.all()).length;
  const lastBackupAt = await db.settings.get('lastBackupAt', null);
  const bkDays = lastBackupAt ? Math.floor((Date.now() - lastBackupAt) / 86400000) : null;
  const mirror = readMirror();
  const syncSession = getSession();
  const cloudSyncedAt = await db.settings.get('cloudSyncedAt', null);

  const syncHtml = syncSession ? `
      <div class="card" style="margin-bottom:0;">
        <div class="kv"><span class="k">账号</span><span class="v">${esc(syncSession.user)} @ ${esc(syncSession.server.replace(/^https?:\/\//, ''))}</span></div>
        <div class="kv"><span class="k">上次同步</span><span class="v">${cloudSyncedAt ? new Date(cloudSyncedAt).toLocaleString('zh-CN') : '从未'}</span></div>
        <div class="kv"><span class="k">加密</span><span class="v">端到端（服务器只见密文）</span></div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn primary sm" style="flex:1;" id="sync-now">立即同步</button>
          <button class="btn ghost sm" style="flex:1;" id="sync-pull">从云端恢复</button>
        </div>
        <div class="mt-8"><button class="btn ghost sm block" id="sync-logout" style="color:var(--ink-3);border-color:var(--hairline);">退出登录</button></div>
        <div class="muted" style="margin-top:10px;">每次打开 App 自动同步；照片仅存本机不参与云同步</div>
      </div>` : `
      <div class="card" style="margin-bottom:0;">
        <div class="seg" id="sync-mode" style="margin-bottom:12px;">
          <button data-m="reg" class="on">注册新账号</button>
          <button data-m="login">登录</button>
        </div>
        <div class="field"><label>服务器地址</label>
          <input type="text" id="sync-server" placeholder="https://sync.waduhek.eu.org" autocapitalize="off"/></div>
        <div class="field"><label>用户名（3~20 位字母/数字/下划线）</label>
          <input type="text" id="sync-user" placeholder="如 coffee_lee" autocapitalize="off" maxlength="20"/></div>
        <div class="field"><label>密码（至少 6 位）</label>
          <input type="password" id="sync-pass" placeholder="密码同时是加密钥匙，务必记牢" maxlength="64"/></div>
        <div class="field" id="sync-pass2-field"><label>确认密码</label>
          <input type="password" id="sync-pass2" placeholder="再输一次" maxlength="64"/></div>
        <button class="btn primary block" id="sync-submit">注册并开启同步</button>
        <div class="muted" style="margin-top:10px;">🔐 端到端加密：密码不离开手机，服务器只存密文。忘记密码 = 云端数据无法找回（本地不受影响）</div>
      </div>`;

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
            ? '本地离线拍照识别文字，再由大模型智能提取字段（在下方填入 API Key 即自动启用；未填 Key 时用内置规则解析）。'
            : '照片直接交给视觉大模型识别，准确率最高；失败自动回退「本地识别 + 大模型解析」。'}
        </div>

        <div id="cloud-cfg" style="margin-top:14px;">
          <div class="field"><label>API 地址（OpenAI 兼容接口）</label>
            <input type="text" id="cfg-base" value="${apiBase}" placeholder="https://open.bigmodel.cn/api/paas/v4"/></div>
          <div class="field-row">
            <div class="field"><label>模型</label>
              <input type="text" id="cfg-model" value="${model}" placeholder="glm-4v-flash"/></div>
            <div class="field"><label>API Key</label>
              <input type="password" id="cfg-key" value="${apiKey}" placeholder="仅保存在本机"/></div>
          </div>
          <button class="btn soft block sm" id="cfg-save">保存配置</button>
          <div class="muted" style="margin-top:8px;">智能解析与云端识别共用 · 智谱 open.bigmodel.cn 的 glm-4v-flash 目前免费</div>
        </div>
      </div>
    </div>

    <div class="set-group">
      <div class="group-label">云同步（端到端加密）</div>
      ${syncHtml}
    </div>

    <div class="set-group">
      <div class="group-label">数据（仅存本机）</div>
      <div class="set-row solo" style="cursor:default;">
        <div class="set-main"><div class="set-title">备份状态</div>
          <div class="set-desc">${bkDays == null ? '从未导出过备份，强烈建议立即导出一份' : bkDays === 0 ? '今天刚导出过，很棒' : `${bkDays} 天前导出过${bkDays > 30 ? '，建议再导出一份' : ''}`}</div></div>
      </div>
      <div style="height:1px;background:var(--hairline);"></div>
      ${mirror && mirror.beans && mirror.beans.length ? `
      <div class="set-row solo" id="row-mirror" style="cursor:pointer;">
        <div class="set-main"><div class="set-title">从本地镜像恢复</div>
          <div class="set-desc">镜像保险箱：${mirror.beans.length} 份档案 · ${(mirror.txs || []).length} 笔流水（${new Date(mirror.t).toLocaleString('zh-CN')}）</div></div>
        <span class="set-arrow">›</span>
      </div>
      <div style="height:1px;background:var(--hairline);"></div>` : ''}
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
        <div class="kv"><span class="k">版本</span><span class="v">鉴豆 v1.9.1</span></div>
        <div class="kv"><span class="k">本机数据</span><span class="v">${beanCount} 份档案 · ${txCount} 笔流水</span></div>
        <div class="kv"><span class="k">持久存储</span><span class="v" id="persist-status">检测中…</span></div>
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
    $('#engine-hint').textContent = val === 'local'
      ? '本地离线拍照识别文字，再由大模型智能提取字段（在下方填入 API Key 即自动启用；未填 Key 时用内置规则解析）。'
      : '照片直接交给视觉大模型识别，准确率最高；失败自动回退「本地识别 + 大模型解析」。';
    toast(val === 'cloud' ? '已切换到云端 AI 识别' : '已切换到本地离线识别', 'ok');
  });

  $('#cfg-save')?.addEventListener('click', async () => {
    await db.settings.set('apiBase', $('#cfg-base').value.trim() || 'https://open.bigmodel.cn/api/paas/v4');
    await db.settings.set('model', $('#cfg-model').value.trim() || 'glm-4v-flash');
    await db.settings.set('apiKey', $('#cfg-key').value.trim());
    toast('识别配置已保存', 'ok');
  });

  /* 备份 */
  $('#row-mirror')?.addEventListener('click', restoreFromMirror);
  $('#row-export').addEventListener('click', exportBackup);
  $('#row-import').addEventListener('click', () => $('#import-input').click());
  $('#import-input').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) importBackup(f);
  });
  $('#row-wipe').addEventListener('click', wipeAll);

  /* 持久存储授权状态（未授权时数据可能被系统空间回收） */
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => {
      const el = $('#persist-status');
      if (el) el.innerHTML = p
        ? '✓ 已授权（系统不会自动清理）'
        : '<span style="color:var(--aging);">未授权（建议经常导出备份）</span>';
    }).catch(() => {});
  }

  /* 云同步 */
  if (syncSession) {
    $('#sync-now')?.addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true; btn.textContent = '同步中…';
      try { await pushData(syncSession); toast('已同步到云端 ☁️', 'ok'); }
      catch (err) { toast(err.message, 'err'); }
      btn.disabled = false; btn.textContent = '立即同步';
    });
    $('#sync-pull')?.addEventListener('click', async () => {
      const yes = await confirmBox('从云端恢复？', '云端数据将与本机合并（同 ID 档案以云端为准）');
      if (!yes) return;
      try {
        const n = await pullData(syncSession);
        toast(`已恢复 ${n} 份档案 ☁️`, 'ok');
        location.hash = '#/';
        setTimeout(() => location.reload(), 400);
      } catch (err) { toast(err.message, 'err'); }
    });
    $('#sync-logout')?.addEventListener('click', async () => {
      const yes = await confirmBox('退出云同步？', '本地数据保留，只是不再自动同步');
      if (!yes) return;
      clearSession();
      toast('已退出');
      render(view);
    });
  } else {
    let mode = 'reg';
    const segEl = $('#sync-mode');
    segEl?.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      mode = b.dataset.m;
      segEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      $('#sync-pass2-field').style.display = mode === 'reg' ? '' : 'none';
      $('#sync-submit').textContent = mode === 'reg' ? '注册并开启同步' : '登录并开启同步';
    });
    $('#sync-submit')?.addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true; btn.textContent = '处理中…';
      try {
        const server = $('#sync-server').value.trim();
        const user = $('#sync-user').value.trim();
        const pass = $('#sync-pass').value;
        if (!server) throw new Error('请填写服务器地址');
        let session;
        if (mode === 'reg') {
          if (pass !== $('#sync-pass2').value) throw new Error('两次密码不一致');
          session = await registerAccount(server, user, pass);
        } else {
          session = await loginAccount(server, user, pass);
        }
        try { await pullData(session); await pushData(session); } catch (_) {}
        toast(mode === 'reg' ? '注册成功，同步已开启 ☁️' : '登录成功，同步已开启 ☁️', 'ok');
        render(view);
      } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
        btn.textContent = mode === 'reg' ? '注册并开启同步' : '登录并开启同步';
      }
    });
  }
}
