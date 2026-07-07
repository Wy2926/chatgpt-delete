/**
 * 管理面板 UI（Shadow DOM 隔离，不影响 ChatGPT 页面自身样式与操作）。
 * 功能：会话列表、复选框多选、Shift 区间选、鼠标拖动框选、搜索、
 *       批量删除 / 归档 / 取消归档、进度反馈、失败重试。
 */
(function () {
  'use strict';

  const B = (window.CGPTBulk = window.CGPTBulk || {});

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }

    .fab {
      position: fixed; right: 20px; bottom: 90px; z-index: 2147483000;
      width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
      background: #10a37f; color: #fff; font-size: 22px; line-height: 1;
      box-shadow: 0 4px 12px rgba(0,0,0,.25); transition: transform .15s;
    }
    .fab:hover { transform: scale(1.08); }

    .overlay {
      position: fixed; inset: 0; z-index: 2147483001;
      background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center;
    }
    .panel {
      width: min(680px, 92vw); height: min(78vh, 720px);
      background: #fff; border-radius: 14px; display: flex; flex-direction: column;
      box-shadow: 0 12px 40px rgba(0,0,0,.35); overflow: hidden; color: #222;
    }
    .hd { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid #eee; }
    .hd h2 { margin: 0; font-size: 16px; flex: 1; }
    .close { border: none; background: none; font-size: 20px; cursor: pointer; color: #666; padding: 4px 8px; }
    .close:hover { color: #000; }

    .tabs { display: flex; gap: 4px; }
    .tab { border: none; background: #f1f1f1; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; color: #444; }
    .tab.active { background: #10a37f; color: #fff; }

    .toolbar { display: flex; gap: 8px; padding: 10px 18px; border-bottom: 1px solid #eee; align-items: center; flex-wrap: wrap; }
    .search { flex: 1; min-width: 160px; padding: 7px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; outline: none; }
    .search:focus { border-color: #10a37f; }
    .btn { border: 1px solid #ddd; background: #fff; padding: 7px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; color: #333; white-space: nowrap; }
    .btn:hover:not(:disabled) { background: #f5f5f5; }
    .btn:disabled { opacity: .45; cursor: not-allowed; }
    .btn.danger { background: #e5484d; border-color: #e5484d; color: #fff; }
    .btn.danger:hover:not(:disabled) { background: #d13438; }
    .btn.primary { background: #10a37f; border-color: #10a37f; color: #fff; }
    .btn.primary:hover:not(:disabled) { background: #0d8a6c; }

    .hint { padding: 6px 18px; font-size: 12px; color: #888; border-bottom: 1px solid #f4f4f4; }

    .list { flex: 1; overflow-y: auto; position: relative; user-select: none; }
    .row {
      display: flex; align-items: center; gap: 10px; padding: 9px 18px; cursor: pointer;
      border-bottom: 1px solid #f6f6f6; font-size: 13px;
    }
    .row:hover { background: #f7faf9; }
    .row.selected { background: #e6f5f0; }
    .row input[type=checkbox] { pointer-events: none; accent-color: #10a37f; width: 15px; height: 15px; flex: none; }
    .row .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row .time { color: #999; font-size: 12px; flex: none; }
    .row .st { flex: none; font-size: 12px; min-width: 52px; text-align: right; }
    .st.ok { color: #10a37f; }
    .st.err { color: #e5484d; }
    .st.doing { color: #b98900; }

    .lasso {
      position: absolute; border: 1px dashed #10a37f; background: rgba(16,163,127,.12);
      pointer-events: none; z-index: 5;
    }

    .empty { padding: 48px 0; text-align: center; color: #999; font-size: 14px; }

    .ft { padding: 12px 18px; border-top: 1px solid #eee; display: flex; flex-direction: column; gap: 8px; }
    .ft-row { display: flex; gap: 8px; align-items: center; }
    .status { flex: 1; font-size: 13px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status.err { color: #e5484d; }
    .progress { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; display: none; }
    .progress.show { display: block; }
    .progress > div { height: 100%; width: 0; background: #10a37f; transition: width .2s; }

    .confirm-mask { position: absolute; inset: 0; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; z-index: 10; }
    .confirm { background: #fff; border-radius: 12px; padding: 20px 22px; width: 320px; box-shadow: 0 8px 30px rgba(0,0,0,.3); }
    .confirm h3 { margin: 0 0 8px; font-size: 15px; }
    .confirm p { margin: 0 0 16px; font-size: 13px; color: #666; line-height: 1.5; }
    .confirm .acts { display: flex; gap: 8px; justify-content: flex-end; }
  `;

  const fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  class Panel {
    constructor() {
      this.tab = 'active';            // 'active' | 'archived'
      this.items = [];                // 当前 tab 的全部会话
      this.selected = new Set();      // 选中的会话 id
      this.itemStatus = new Map();    // id -> {state:'doing'|'ok'|'err', msg}
      this.failedIds = [];            // 上次批量操作失败的 id
      this.lastAction = null;         // 'delete' | 'archive' | 'unarchive'
      this.running = false;
      this.queue = null;
      this.lastClickedIndex = -1;
      this.filter = '';
      this._buildDom();
    }

    _buildDom() {
      this.host = document.createElement('div');
      this.host.id = 'cgpt-bulk-host';
      const root = this.host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = CSS;
      root.appendChild(style);

      this.fab = document.createElement('button');
      this.fab.className = 'fab';
      this.fab.title = '批量管理 ChatGPT 会话';
      this.fab.textContent = '🗂';
      this.fab.addEventListener('click', () => this.open());
      root.appendChild(this.fab);

      this.overlay = document.createElement('div');
      this.overlay.className = 'overlay';
      this.overlay.style.display = 'none';
      this.overlay.innerHTML = `
        <div class="panel">
          <div class="hd">
            <h2>会话批量管理</h2>
            <div class="tabs">
              <button class="tab active" data-tab="active">会话</button>
              <button class="tab" data-tab="archived">已归档</button>
            </div>
            <button class="close" title="关闭">✕</button>
          </div>
          <div class="toolbar">
            <input class="search" placeholder="搜索会话标题…" />
            <button class="btn" data-act="refresh">刷新</button>
            <button class="btn" data-act="selectAll">全选</button>
            <button class="btn" data-act="invert">反选</button>
            <button class="btn" data-act="clear">清除选择</button>
          </div>
          <div class="hint">点击选择 / 取消；Shift+点击区间选择；在空白处按住鼠标拖动可框选。</div>
          <div class="list"></div>
          <div class="ft">
            <div class="progress"><div></div></div>
            <div class="ft-row">
              <span class="status">加载中…</span>
              <button class="btn" data-act="retryFailed" style="display:none">重试失败项</button>
              <button class="btn" data-act="pause" style="display:none">暂停</button>
              <button class="btn" data-act="cancel" style="display:none">取消</button>
              <button class="btn primary" data-act="archive">归档所选</button>
              <button class="btn danger" data-act="delete">删除所选</button>
            </div>
          </div>
        </div>`;
      root.appendChild(this.overlay);

      this.$ = (sel) => this.overlay.querySelector(sel);
      this.listEl = this.$('.list');
      this.statusEl = this.$('.status');
      this.progressEl = this.$('.progress');
      this.progressBar = this.$('.progress > div');

      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay && !this.running) this.close();
      });
      this.$('.close').addEventListener('click', () => { if (!this.running) this.close(); });
      this.$('.search').addEventListener('input', (e) => {
        this.filter = e.target.value.trim().toLowerCase();
        this.renderList();
      });
      this.overlay.querySelectorAll('.tab').forEach((t) => {
        t.addEventListener('click', () => { if (!this.running) this.switchTab(t.dataset.tab); });
      });
      this.overlay.addEventListener('click', (e) => {
        const act = e.target.dataset && e.target.dataset.act;
        if (act && this[`_act_${act}`]) this[`_act_${act}`]();
      });

      this._setupLasso();
      document.documentElement.appendChild(this.host);
    }

    /* ---------- 面板开关 / 数据加载 ---------- */

    open() {
      this.overlay.style.display = 'flex';
      this.refresh();
    }

    close() { this.overlay.style.display = 'none'; }

    switchTab(tab) {
      if (tab === this.tab) return;
      this.tab = tab;
      this.overlay.querySelectorAll('.tab').forEach((t) =>
        t.classList.toggle('active', t.dataset.tab === tab));
      const del = this.$('[data-act=delete]');
      const arc = this.$('[data-act=archive]');
      arc.textContent = tab === 'archived' ? '取消归档所选' : '归档所选';
      del.style.display = '';
      arc.dataset.act = tab === 'archived' ? 'unarchive' : 'archive';
      this.refresh();
    }

    async refresh() {
      this.selected.clear();
      this.itemStatus.clear();
      this.failedIds = [];
      this.$('[data-act=retryFailed]').style.display = 'none';
      this.items = [];
      this.renderList();
      this.setStatus('加载会话列表…');
      try {
        this.items = await B.fetchAllConversations(this.tab === 'archived', (n, total) => {
          this.setStatus(`加载会话列表… ${n}/${total}`);
        });
        this.setStatus(`共 ${this.items.length} 个会话`);
      } catch (err) {
        this.setStatus(`加载失败：${err.message}`, true);
      }
      this.renderList();
    }

    /* ---------- 渲染 ---------- */

    visibleItems() {
      if (!this.filter) return this.items;
      return this.items.filter((it) => (it.title || '').toLowerCase().includes(this.filter));
    }

    renderList() {
      const items = this.visibleItems();
      if (items.length === 0) {
        this.listEl.innerHTML = '<div class="empty">没有会话</div>';
        return;
      }
      this.listEl.innerHTML = items.map((it, i) => {
        const sel = this.selected.has(it.id);
        const st = this.itemStatus.get(it.id);
        let stHtml = '';
        if (st) {
          const cls = st.state === 'ok' ? 'ok' : st.state === 'err' ? 'err' : 'doing';
          stHtml = `<span class="st ${cls}" title="${esc(st.msg || '')}">${esc(st.label)}</span>`;
        }
        return `<div class="row ${sel ? 'selected' : ''}" data-id="${esc(it.id)}" data-i="${i}">
          <input type="checkbox" ${sel ? 'checked' : ''} tabindex="-1" />
          <span class="title" title="${esc(it.title)}">${esc(it.title || '(无标题)')}</span>
          <span class="time">${fmtTime(it.update_time)}</span>
          ${stHtml}
        </div>`;
      }).join('');

      this.listEl.querySelectorAll('.row').forEach((row) => {
        row.addEventListener('click', (e) => this._onRowClick(row, e));
      });
      this._updateActionButtons();
    }

    _onRowClick(row, e) {
      if (this.running) return;
      const items = this.visibleItems();
      const i = Number(row.dataset.i);
      if (e.shiftKey && this.lastClickedIndex >= 0) {
        const [a, b] = [Math.min(this.lastClickedIndex, i), Math.max(this.lastClickedIndex, i)];
        for (let k = a; k <= b; k++) this.selected.add(items[k].id);
      } else {
        const id = row.dataset.id;
        if (this.selected.has(id)) this.selected.delete(id);
        else this.selected.add(id);
        this.lastClickedIndex = i;
      }
      this.renderList();
      this._updateCount();
    }

    _updateCount() {
      if (!this.running) {
        this.setStatus(this.selected.size > 0
          ? `已选择 ${this.selected.size} / ${this.items.length} 个会话`
          : `共 ${this.items.length} 个会话`);
      }
    }

    _updateActionButtons() {
      const dis = this.running || this.selected.size === 0;
      this.$('[data-act=delete]').disabled = dis;
      const arc = this.$('[data-act=archive], [data-act=unarchive]');
      if (arc) arc.disabled = dis;
    }

    setStatus(msg, isErr = false) {
      this.statusEl.textContent = msg;
      this.statusEl.classList.toggle('err', isErr);
    }

    /* ---------- 框选（lasso） ---------- */

    _setupLasso() {
      let start = null;
      let lassoEl = null;
      let addMode = true;

      const rectOf = (el) => el.getBoundingClientRect();

      this.listEl.addEventListener('mousedown', (e) => {
        if (this.running || e.button !== 0) return;
        // 在行上按下由点击处理；只有按在列表空白处或想拖动时启动框选
        start = { x: e.clientX, y: e.clientY };
        addMode = !e.altKey;
        lassoEl = null;
      });

      const onMove = (e) => {
        if (!start) return;
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        if (!lassoEl && dx < 5 && dy < 5) return; // 视为点击
        if (!lassoEl) {
          lassoEl = document.createElement('div');
          lassoEl.className = 'lasso';
          this.listEl.appendChild(lassoEl);
        }
        const listRect = rectOf(this.listEl);
        const x1 = Math.min(start.x, e.clientX);
        const y1 = Math.min(start.y, e.clientY);
        const x2 = Math.max(start.x, e.clientX);
        const y2 = Math.max(start.y, e.clientY);
        Object.assign(lassoEl.style, {
          left: `${x1 - listRect.left}px`,
          top: `${y1 - listRect.top + this.listEl.scrollTop}px`,
          width: `${x2 - x1}px`,
          height: `${y2 - y1}px`,
        });
        // 实时高亮命中的行
        this.listEl.querySelectorAll('.row').forEach((row) => {
          const r = rectOf(row);
          const hit = !(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2);
          if (hit) row.classList.add('selected');
          else row.classList.toggle('selected', this.selected.has(row.dataset.id));
        });
      };

      const onUp = (e) => {
        if (!start) return;
        if (lassoEl) {
          const x1 = Math.min(start.x, e.clientX);
          const y1 = Math.min(start.y, e.clientY);
          const x2 = Math.max(start.x, e.clientX);
          const y2 = Math.max(start.y, e.clientY);
          this.listEl.querySelectorAll('.row').forEach((row) => {
            const r = rectOf(row);
            const hit = !(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2);
            if (hit) {
              if (addMode) this.selected.add(row.dataset.id);
              else this.selected.delete(row.dataset.id);
            }
          });
          lassoEl.remove();
          this.renderList();
          this._updateCount();
          // 阻止随后的 click 误触发行点击
          const stopClick = (ev) => { ev.stopPropagation(); };
          this.listEl.addEventListener('click', stopClick, { capture: true, once: true });
        }
        start = null;
        lassoEl = null;
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }

    /* ---------- 工具栏动作 ---------- */

    _act_refresh() { if (!this.running) this.refresh(); }

    _act_selectAll() {
      if (this.running) return;
      this.visibleItems().forEach((it) => this.selected.add(it.id));
      this.renderList();
      this._updateCount();
    }

    _act_invert() {
      if (this.running) return;
      this.visibleItems().forEach((it) => {
        if (this.selected.has(it.id)) this.selected.delete(it.id);
        else this.selected.add(it.id);
      });
      this.renderList();
      this._updateCount();
    }

    _act_clear() {
      if (this.running) return;
      this.selected.clear();
      this.renderList();
      this._updateCount();
    }

    _act_pause() {
      if (!this.queue) return;
      const btn = this.$('[data-act=pause]');
      if (this.queue.paused) {
        this.queue.resume();
        btn.textContent = '暂停';
      } else {
        this.queue.pause();
        btn.textContent = '继续';
      }
    }

    _act_cancel() { if (this.queue) this.queue.abort(); }

    _act_delete() { this._confirmAndRun('delete'); }

    _act_archive() { this._confirmAndRun('archive'); }

    _act_unarchive() { this._confirmAndRun('unarchive'); }

    _act_retryFailed() {
      if (this.running || this.failedIds.length === 0 || !this.lastAction) return;
      const ids = this.failedIds.slice();
      this.failedIds = [];
      this.$('[data-act=retryFailed]').style.display = 'none';
      this._runBatch(this.lastAction, ids);
    }

    /* ---------- 批量执行 ---------- */

    _confirmAndRun(action) {
      if (this.running || this.selected.size === 0) return;
      const n = this.selected.size;
      const verbs = { delete: '删除', archive: '归档', unarchive: '取消归档' };
      const extra = action === 'delete' ? '删除后无法恢复。' : '';
      const mask = document.createElement('div');
      mask.className = 'confirm-mask';
      mask.innerHTML = `
        <div class="confirm">
          <h3>确认${verbs[action]}</h3>
          <p>将对 <b>${n}</b> 个会话执行「${verbs[action]}」。${extra}</p>
          <div class="acts">
            <button class="btn" data-c="no">取消</button>
            <button class="btn ${action === 'delete' ? 'danger' : 'primary'}" data-c="yes">确认${verbs[action]}</button>
          </div>
        </div>`;
      this.$('.panel').appendChild(mask);
      mask.addEventListener('click', (e) => {
        const c = e.target.dataset && e.target.dataset.c;
        if (c === 'no' || e.target === mask) mask.remove();
        if (c === 'yes') {
          mask.remove();
          this._runBatch(action, [...this.selected]);
        }
      });
    }

    async _runBatch(action, ids) {
      const fns = {
        delete: B.deleteConversation,
        archive: B.archiveConversation,
        unarchive: B.unarchiveConversation,
      };
      const verbs = { delete: '删除', archive: '归档', unarchive: '取消归档' };
      const fn = fns[action];
      this.lastAction = action;
      this.running = true;
      this.itemStatus.clear();
      this._setRunningUi(true);

      const total = ids.length;
      let finished = 0;
      const tick = () => {
        this.progressBar.style.width = `${Math.round((finished / total) * 100)}%`;
        this.setStatus(`${verbs[action]}中… ${finished}/${total}`);
      };
      tick();

      this.queue = new B.TaskQueue();
      const tasks = ids.map((id) => ({ id, run: () => fn(id) }));
      const result = await this.queue.run(tasks, {
        onItemStart: (t) => {
          this.itemStatus.set(t.id, { state: 'doing', label: '处理中' });
          this._patchRowStatus(t.id);
        },
        onItemDone: (t) => {
          finished++;
          this.itemStatus.set(t.id, { state: 'ok', label: '✓ 完成' });
          this.selected.delete(t.id);
          this._patchRowStatus(t.id);
          tick();
        },
        onItemError: (t, err, willRetry) => {
          if (!willRetry) {
            finished++;
            this.itemStatus.set(t.id, { state: 'err', label: '✗ 失败', msg: err.message });
            this._patchRowStatus(t.id);
            tick();
          }
        },
        onItemRetryWait: (t, waitMs, attempt) => {
          this.itemStatus.set(t.id, {
            state: 'doing',
            label: `重试${attempt}`,
            msg: `${Math.ceil(waitMs / 1000)}s 后重试`,
          });
          this._patchRowStatus(t.id);
          this.setStatus(`遇到限速，${Math.ceil(waitMs / 1000)} 秒后自动重试… (${finished}/${total})`);
        },
      });

      this.running = false;
      this.queue = null;
      this._setRunningUi(false);
      this.failedIds = result.failed.map((f) => f.id);

      if (result.aborted) {
        this.setStatus(`已取消：完成 ${result.done.length}，未处理 ${total - result.done.length - result.failed.length}`, false);
      } else if (result.failed.length > 0) {
        const firstErr = result.failed[0].error;
        this.setStatus(`完成 ${result.done.length}，失败 ${result.failed.length}（${firstErr ? firstErr.message : '未知错误'}）`, true);
        this.$('[data-act=retryFailed]').style.display = '';
      } else {
        this.setStatus(`全部${verbs[action]}成功（共 ${result.done.length} 个）`);
      }

      // 成功的项从列表中移除
      const doneSet = new Set(result.done);
      this.items = this.items.filter((it) => !doneSet.has(it.id));
      this.renderList();
      if (result.done.length > 0) this._notifySidebarRefresh();
    }

    _patchRowStatus(id) {
      const row = [...this.listEl.querySelectorAll('.row')].find((r) => r.dataset.id === id);
      if (!row) return;
      let st = row.querySelector('.st');
      const info = this.itemStatus.get(id);
      if (!info) { if (st) st.remove(); return; }
      if (!st) {
        st = document.createElement('span');
        row.appendChild(st);
      }
      st.className = `st ${info.state === 'ok' ? 'ok' : info.state === 'err' ? 'err' : 'doing'}`;
      st.textContent = info.label;
      st.title = info.msg || '';
    }

    _setRunningUi(running) {
      this.$('[data-act=pause]').style.display = running ? '' : 'none';
      this.$('[data-act=pause]').textContent = '暂停';
      this.$('[data-act=cancel]').style.display = running ? '' : 'none';
      this.$('[data-act=refresh]').disabled = running;
      this.$('[data-act=selectAll]').disabled = running;
      this.$('[data-act=invert]').disabled = running;
      this.$('[data-act=clear]').disabled = running;
      this.progressEl.classList.toggle('show', running);
      if (!running) this.progressBar.style.width = '0';
      this._updateActionButtons();
    }

    /** 让 ChatGPT 自己的侧边栏刷新（简单方式：软刷新页面路由不可行，提示用户） */
    _notifySidebarRefresh() {
      // ChatGPT 侧边栏由其内部状态管理，无法直接触发刷新；
      // 面板内数据已即时更新，页面侧边栏在下次导航/刷新后同步。
    }
  }

  B.Panel = Panel;
})();
