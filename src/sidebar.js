/**
 * ChatGPT 原生侧边栏集成：
 * 在侧边栏顶部注入「批量选择」开关，开启后可直接在原生会话列表上
 * 点击多选 / Shift 区间选 / 拖动框选，底部浮出操作条执行批量删除 / 归档。
 * 通过 MutationObserver 适配侧边栏的动态 DOM；退出选择模式完全还原。
 */
(function () {
  'use strict';

  const B = (window.CGPTBulk = window.CGPTBulk || {});
  const I = B.ICONS;

  const STYLE_ID = 'cgpt-bulk-sidebar-style';
  const CSS = `
    .cgpt-bulk-toggle {
      display: flex; align-items: center; gap: 8px; margin: 6px 8px; padding: 8px 10px;
      border: 1px solid rgba(16,163,127,.4); border-radius: 8px; cursor: pointer;
      font-size: 13px; color: #10a37f; background: transparent; width: calc(100% - 16px);
      justify-content: center;
    }
    .cgpt-bulk-toggle svg { width: 15px; height: 15px; }
    .cgpt-bulk-toggle:hover { background: rgba(16,163,127,.08); }
    .cgpt-bulk-toggle.on { background: #10a37f; color: #fff; }

    .cgpt-bulk-select-mode a[href*="/c/"] { position: relative; }
    .cgpt-bulk-cb {
      position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
      width: 15px; height: 15px; accent-color: #10a37f; z-index: 3; pointer-events: none;
    }
    .cgpt-bulk-select-mode a[href*="/c/"] { padding-left: 24px !important; }
    .cgpt-bulk-hit { outline: 2px solid rgba(16,163,127,.7); outline-offset: -2px; border-radius: 8px; }
    .cgpt-bulk-sel { background: rgba(16,163,127,.15) !important; border-radius: 8px; }
    .cgpt-bulk-err { outline: 2px solid rgba(229,72,77,.8); outline-offset: -2px; border-radius: 8px; }
    .cgpt-bulk-fade { transition: opacity .4s, max-height .4s; opacity: 0 !important; max-height: 0 !important; overflow: hidden; }

    .cgpt-bulk-lasso {
      position: fixed; border: 1px dashed #10a37f; background: rgba(16,163,127,.12);
      pointer-events: none; z-index: 2147483003;
    }

    .cgpt-bulk-bar {
      position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
      z-index: 2147483004; display: flex; align-items: center; gap: 10px;
      background: #fff; color: #222; border: 1px solid #e3e3e3; border-radius: 999px;
      padding: 10px 16px; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.25);
      font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    .cgpt-bulk-bar .cnt { font-weight: 600; white-space: nowrap; }
    .cgpt-bulk-bar button {
      display: inline-flex; align-items: center; gap: 6px; border: 1px solid #ddd;
      background: #fff; color: #333; border-radius: 999px; padding: 7px 14px;
      font-size: 13px; cursor: pointer; white-space: nowrap;
    }
    .cgpt-bulk-bar button svg { width: 14px; height: 14px; }
    .cgpt-bulk-bar button:hover:not(:disabled) { background: #f5f5f5; }
    .cgpt-bulk-bar button:disabled { opacity: .45; cursor: not-allowed; }
    .cgpt-bulk-bar .arch { background: #10a37f; border-color: #10a37f; color: #fff; }
    .cgpt-bulk-bar .arch:hover:not(:disabled) { background: #0d8a6c; }
    .cgpt-bulk-bar .del { background: #e5484d; border-color: #e5484d; color: #fff; }
    .cgpt-bulk-bar .del:hover:not(:disabled) { background: #d13438; }
  `;

  const convIdFromHref = (href) => {
    const m = /\/c\/([a-z0-9-]+)/i.exec(href || '');
    return m ? m[1] : null;
  };

  class SidebarSelect {
    constructor() {
      this.enabled = false;
      this.running = false;
      this.selected = new Set();
      this.lastClickedId = null;
      this.queue = null;
      this.toggleBtn = null;
      this.bar = null;
      this._injectStyle();
      this._observe();
      this._bindGlobalHandlers();
      B.sidebarSync = (ids) => this._removeLinks(ids);
    }

    _injectStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    _nav() {
      return document.querySelector('nav');
    }

    _links() {
      const nav = this._nav();
      if (!nav) return [];
      return [...nav.querySelectorAll('a[href*="/c/"]')].filter((a) => convIdFromHref(a.getAttribute('href')));
    }

    /* ---------- 注入开关按钮，适配 DOM 变化 ---------- */

    _observe() {
      const ensure = () => {
        const nav = this._nav();
        if (!nav) return;
        if (!this.toggleBtn || !nav.contains(this.toggleBtn)) {
          this.toggleBtn = document.createElement('button');
          this.toggleBtn.type = 'button';
          this.toggleBtn.className = 'cgpt-bulk-toggle';
          this._renderToggle();
          this.toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.setEnabled(!this.enabled);
          });
          nav.insertBefore(this.toggleBtn, nav.firstChild);
        }
        if (this.enabled) this._applyCheckboxes();
      };
      ensure();
      this.observer = new MutationObserver(() => ensure());
      this.observer.observe(document.body, { childList: true, subtree: true });
    }

    _renderToggle() {
      if (!this.toggleBtn) return;
      this.toggleBtn.classList.toggle('on', this.enabled);
      this.toggleBtn.innerHTML = this.enabled
        ? `${I.close}<span>退出批量选择</span>`
        : `${I.lasso}<span>批量选择</span>`;
    }

    setEnabled(on) {
      if (this.running) return;
      this.enabled = on;
      this._renderToggle();
      document.body.classList.toggle('cgpt-bulk-select-mode', on);
      if (on) {
        this._applyCheckboxes();
      } else {
        this.selected.clear();
        this.lastClickedId = null;
        this._clearCheckboxes();
        this._updateBar();
      }
    }

    /* ---------- 复选框注入 / 还原 ---------- */

    _applyCheckboxes() {
      this._links().forEach((a) => {
        const id = convIdFromHref(a.getAttribute('href'));
        let cb = a.querySelector('.cgpt-bulk-cb');
        if (!cb) {
          cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'cgpt-bulk-cb';
          a.prepend(cb);
        }
        cb.checked = this.selected.has(id);
        a.classList.toggle('cgpt-bulk-sel', this.selected.has(id));
      });
    }

    _clearCheckboxes() {
      document.querySelectorAll('.cgpt-bulk-cb').forEach((cb) => cb.remove());
      document.querySelectorAll('.cgpt-bulk-sel, .cgpt-bulk-err, .cgpt-bulk-hit').forEach((el) =>
        el.classList.remove('cgpt-bulk-sel', 'cgpt-bulk-err', 'cgpt-bulk-hit'));
    }

    /* ---------- 点击 / Shift / 框选 ---------- */

    _bindGlobalHandlers() {
      // 捕获阶段拦截选择模式下的会话点击，阻止导航
      document.addEventListener('click', (e) => {
        if (!this.enabled) return;
        const a = e.target.closest && e.target.closest('a[href*="/c/"]');
        if (!a || !this._nav()?.contains(a)) return;
        const id = convIdFromHref(a.getAttribute('href'));
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.running) return;
        if (e.shiftKey && this.lastClickedId) {
          this._rangeSelect(this.lastClickedId, id);
        } else {
          if (this.selected.has(id)) this.selected.delete(id);
          else this.selected.add(id);
          this.lastClickedId = id;
        }
        this._applyCheckboxes();
        this._updateBar();
      }, true);

      this._setupLasso();
    }

    _rangeSelect(fromId, toId) {
      const links = this._links();
      const ids = links.map((a) => convIdFromHref(a.getAttribute('href')));
      const i1 = ids.indexOf(fromId);
      const i2 = ids.indexOf(toId);
      if (i1 < 0 || i2 < 0) return;
      const [a, b] = [Math.min(i1, i2), Math.max(i1, i2)];
      for (let k = a; k <= b; k++) this.selected.add(ids[k]);
    }

    _setupLasso() {
      let start = null;
      let lassoEl = null;

      document.addEventListener('mousedown', (e) => {
        if (!this.enabled || this.running || e.button !== 0) return;
        const nav = this._nav();
        if (!nav) return;
        const r = nav.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        start = { x: e.clientX, y: e.clientY };
        lassoEl = null;
      }, true);

      document.addEventListener('mousemove', (e) => {
        if (!start) return;
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        if (!lassoEl && dx < 6 && dy < 6) return;
        if (!lassoEl) {
          lassoEl = document.createElement('div');
          lassoEl.className = 'cgpt-bulk-lasso';
          document.body.appendChild(lassoEl);
        }
        const x1 = Math.min(start.x, e.clientX);
        const y1 = Math.min(start.y, e.clientY);
        const x2 = Math.max(start.x, e.clientX);
        const y2 = Math.max(start.y, e.clientY);
        Object.assign(lassoEl.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
        this._links().forEach((a) => {
          const r = a.getBoundingClientRect();
          const hit = !(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2);
          a.classList.toggle('cgpt-bulk-hit', hit);
        });
      }, true);

      document.addEventListener('mouseup', (e) => {
        if (!start) return;
        if (lassoEl) {
          const x1 = Math.min(start.x, e.clientX);
          const y1 = Math.min(start.y, e.clientY);
          const x2 = Math.max(start.x, e.clientX);
          const y2 = Math.max(start.y, e.clientY);
          this._links().forEach((a) => {
            a.classList.remove('cgpt-bulk-hit');
            const r = a.getBoundingClientRect();
            const hit = !(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2);
            if (hit) {
              const id = convIdFromHref(a.getAttribute('href'));
              if (id) {
                if (e.altKey) this.selected.delete(id);
                else this.selected.add(id);
              }
            }
          });
          lassoEl.remove();
          this._applyCheckboxes();
          this._updateBar();
          const stopClick = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
          document.addEventListener('click', stopClick, { capture: true, once: true });
        }
        start = null;
        lassoEl = null;
      }, true);
    }

    /* ---------- 底部操作条 ---------- */

    _updateBar(progressText) {
      const n = this.selected.size;
      if (n === 0 && !this.running) {
        if (this.bar) { this.bar.remove(); this.bar = null; }
        return;
      }
      if (!this.bar) {
        this.bar = document.createElement('div');
        this.bar.className = 'cgpt-bulk-bar';
        document.body.appendChild(this.bar);
      }
      if (this.running) {
        this.bar.innerHTML = `
          <span class="cnt">${progressText || '处理中…'}</span>
          <button class="cancel">${I.stop}<span>取消</span></button>`;
        this.bar.querySelector('.cancel').addEventListener('click', () => this.queue && this.queue.abort());
      } else {
        this.bar.innerHTML = `
          <span class="cnt">已选 ${n} 项</span>
          <button class="arch">${I.archive}<span>归档</span></button>
          <button class="del">${I.trash}<span>删除</span></button>
          <button class="cancel">${I.close}<span>取消</span></button>`;
        this.bar.querySelector('.arch').addEventListener('click', () => this._run('archive'));
        this.bar.querySelector('.del').addEventListener('click', () => this._run('delete'));
        this.bar.querySelector('.cancel').addEventListener('click', () => {
          this.selected.clear();
          this._applyCheckboxes();
          this._updateBar();
        });
      }
    }

    async _run(action) {
      if (this.running || this.selected.size === 0) return;
      const verbs = { delete: '删除', archive: '归档' };
      if (!window.confirm(`确认${verbs[action]}所选 ${this.selected.size} 个会话？${action === 'delete' ? '删除后无法恢复。' : ''}`)) return;

      const fn = action === 'delete' ? B.deleteConversation : B.archiveConversation;
      const ids = [...this.selected];
      const total = ids.length;
      let finished = 0;
      this.running = true;
      this._updateBar(`${verbs[action]}中… 0/${total}`);

      this.queue = new B.TaskQueue();
      const tasks = ids.map((id) => ({ id, run: () => fn(id) }));
      const result = await this.queue.run(tasks, {
        onItemDone: (t) => {
          finished++;
          this.selected.delete(t.id);
          this._removeLinks([t.id]);
          this._updateBar(`${verbs[action]}中… ${finished}/${total}`);
        },
        onItemError: (t, err, willRetry) => {
          if (!willRetry) {
            finished++;
            this._markError(t.id, err.message);
            this._updateBar(`${verbs[action]}中… ${finished}/${total}`);
          }
        },
        onItemRetryWait: (t, waitMs) => {
          this._updateBar(`限速中，${Math.ceil(waitMs / 1000)}s 后重试… ${finished}/${total}`);
        },
      });

      this.running = false;
      this.queue = null;
      if (result.failed.length > 0) {
        this._updateBar();
        window.alert(`完成 ${result.done.length}，失败 ${result.failed.length}：${result.failed[0].error?.message || '未知错误'}\n失败的会话仍保持选中，可重试。`);
      } else {
        this._updateBar();
      }
      this._applyCheckboxes();
    }

    _markError(id, msg) {
      this._links().forEach((a) => {
        if (convIdFromHref(a.getAttribute('href')) === id) {
          a.classList.add('cgpt-bulk-err');
          a.title = msg || '操作失败';
        }
      });
    }

    /** 以淡出动画从侧边栏移除指定会话（面板操作成功后也会调用同步） */
    _removeLinks(ids) {
      const set = new Set(ids);
      this._links().forEach((a) => {
        if (set.has(convIdFromHref(a.getAttribute('href')))) {
          const li = a.closest('li') || a;
          li.classList.add('cgpt-bulk-fade');
          setTimeout(() => li.remove(), 450);
        }
      });
    }
  }

  B.SidebarSelect = SidebarSelect;
})();
