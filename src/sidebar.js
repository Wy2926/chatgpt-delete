/**
 * ChatGPT 原生侧边栏集成（零侵入覆盖层方案）：
 * 不向 React 管理的 DOM 插入任何节点——开关按钮、复选框、选中高亮、框选、
 * 操作条全部绘制在扩展自己的 Shadow DOM 覆盖层上，按会话行的屏幕位置实时定位。
 * 点击在捕获阶段拦截（阻止导航），避免 hydration/渲染冲突（React #418）。
 */
(function () {
  'use strict';

  const B = (window.CGPTBulk = window.CGPTBulk || {});
  const I = B.ICONS;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
    svg { display: block; width: 1em; height: 1em; }

    .chip {
      position: fixed; z-index: 2147483003; display: none; align-items: center; gap: 6px;
      justify-content: center; padding: 7px 10px; font-size: 13px; cursor: pointer;
      border: 1px solid rgba(16,163,127,.55); border-radius: 8px;
      background: #fff; color: #10a37f; box-shadow: 0 2px 8px rgba(0,0,0,.15);
      user-select: none; white-space: nowrap;
    }
    .chip:hover { background: rgba(16,163,127,.08); }
    .chip.on { background: #10a37f; color: #fff; }
    .chip.show { display: flex; }

    .layer { position: fixed; inset: 0; z-index: 2147483002; pointer-events: none; display: none; }
    .layer.show { display: block; }
    .hl { position: fixed; border-radius: 8px; background: rgba(16,163,127,.18); }
    .hl.hit { background: rgba(16,163,127,.28); outline: 1px dashed #10a37f; outline-offset: -1px; }
    .hl.err { background: rgba(229,72,77,.18); outline: 1px solid rgba(229,72,77,.8); outline-offset: -1px; }
    .cb {
      position: fixed; width: 15px; height: 15px; border-radius: 4px;
      border: 1.5px solid #9aa; background: #fff; display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 11px;
    }
    .cb.checked { background: #10a37f; border-color: #10a37f; }
    .lasso { position: fixed; border: 1px dashed #10a37f; background: rgba(16,163,127,.12); }

    .bar {
      position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
      z-index: 2147483004; display: none; align-items: center; gap: 10px;
      background: #fff; color: #222; border: 1px solid #e3e3e3; border-radius: 999px;
      padding: 10px 16px; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.25);
    }
    .bar.show { display: flex; }
    .bar .cnt { font-weight: 600; white-space: nowrap; }
    .bar button {
      display: inline-flex; align-items: center; gap: 6px; border: 1px solid #ddd;
      background: #fff; color: #333; border-radius: 999px; padding: 7px 14px;
      font-size: 13px; cursor: pointer; white-space: nowrap;
    }
    .bar button:hover:not(:disabled) { background: #f5f5f5; }
    .bar button:disabled { opacity: .45; cursor: not-allowed; }
    .bar .arch { background: #10a37f; border-color: #10a37f; color: #fff; }
    .bar .arch:hover:not(:disabled) { background: #0d8a6c; }
    .bar .del { background: #e5484d; border-color: #e5484d; color: #fff; }
    .bar .del:hover:not(:disabled) { background: #d13438; }
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
      this.hidden = new Set();   // 已删除/归档成功、应视为消失的会话
      this.errors = new Map();   // id -> 错误信息
      this.hitIds = new Set();   // 框选实时命中的行
      this.lastClickedId = null;
      this.queue = null;
      this._raf = 0;
      this._buildDom();
      this._bindGlobalHandlers();
      this._startTracking();
      B.sidebarSync = (ids) => {
        ids.forEach((id) => this.hidden.add(id));
        this._applyHidden();
        this._scheduleUpdate();
      };
    }

    _buildDom() {
      this.host = document.createElement('div');
      this.host.id = 'cgpt-bulk-sidebar-host';
      const root = this.host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = CSS;
      root.appendChild(style);

      this.chip = document.createElement('button');
      this.chip.type = 'button';
      this.chip.className = 'chip';
      this.chip.addEventListener('click', () => this.setEnabled(!this.enabled));
      root.appendChild(this.chip);

      this.layer = document.createElement('div');
      this.layer.className = 'layer';
      root.appendChild(this.layer);

      this.bar = document.createElement('div');
      this.bar.className = 'bar';
      root.appendChild(this.bar);

      this._renderChip();
      (document.body || document.documentElement).appendChild(this.host);
    }

    _renderChip() {
      this.chip.classList.toggle('on', this.enabled);
      this.chip.innerHTML = this.enabled
        ? `${I.close}<span>退出批量选择</span>`
        : `${I.lasso}<span>批量选择</span>`;
    }

    /**
     * 定位侧边栏容器：优先包含会话链接的 nav；否则回退到
     * 会话链接的最近可滚动祖先（兼容 ChatGPT DOM 结构变化）。
     */
    _nav() {
      for (const nav of document.querySelectorAll('nav')) {
        if (nav.querySelector('a[href*="/c/"]')) return nav;
      }
      const link = document.querySelector('aside a[href*="/c/"], a[href*="/c/"]');
      if (!link) return document.querySelector('nav');
      let el = link.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') &&
            el.getBoundingClientRect().width < window.innerWidth * 0.6) {
          return el;
        }
        el = el.parentElement;
      }
      return link.closest('aside') || document.querySelector('nav');
    }

    _links() {
      const nav = this._nav();
      if (!nav) return [];
      return [...nav.querySelectorAll('a[href*="/c/"]')].filter((a) => {
        const id = convIdFromHref(a.getAttribute('href'));
        return id && !this.hidden.has(id);
      });
    }

    /**
     * 对已删除/已归档成功的行设置 display:none（仅改样式属性、不增删节点，
     * hydration 完成后安全），行立即从侧边栏消失，无需刷新页面。
     * React 重渲染可能重建节点，故在每次覆盖层更新时重新应用。
     */
    _applyHidden() {
      if (this.hidden.size === 0) return;
      document.querySelectorAll('a[href*="/c/"]').forEach((a) => {
        const id = convIdFromHref(a.getAttribute('href'));
        if (id && this.hidden.has(id)) {
          const row = a.closest('li') || a;
          if (row.style.display !== 'none') row.style.setProperty('display', 'none', 'important');
        }
      });
    }

    setEnabled(on) {
      if (this.running) return;
      this.enabled = on;
      if (!on) {
        this.selected.clear();
        this.errors.clear();
        this.lastClickedId = null;
      }
      this._renderChip();
      this._scheduleUpdate();
    }

    /* ---------- 覆盖层定位与渲染 ---------- */

    _startTracking() {
      const onAnything = () => this._scheduleUpdate();
      window.addEventListener('scroll', onAnything, { capture: true, passive: true });
      window.addEventListener('resize', onAnything);
      this.observer = new MutationObserver(onAnything);
      this.observer.observe(document.body, { childList: true, subtree: true });
      setInterval(onAnything, 1200); // 兜底
      this._scheduleUpdate();
    }

    _scheduleUpdate() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this._update();
      });
    }

    _update() {
      this._applyHidden();
      const nav = this._nav();
      // 开关按钮：悬浮在侧边栏顶部
      if (nav) {
        const r = nav.getBoundingClientRect();
        if (r.width > 100) {
          this.chip.classList.add('show');
          this.chip.style.left = `${Math.round(r.left + 8)}px`;
          this.chip.style.top = `${Math.round(r.top + 6)}px`;
          this.chip.style.width = `${Math.round(r.width - 16)}px`;
        } else {
          this.chip.classList.remove('show');
        }
      } else {
        this.chip.classList.remove('show');
      }

      // 选择覆盖层
      if (!this.enabled || !nav) {
        this.layer.classList.remove('show');
        this._updateBar();
        return;
      }
      this.layer.classList.add('show');
      const navRect = nav.getBoundingClientRect();
      const frag = document.createDocumentFragment();
      [...nav.querySelectorAll('a[href*="/c/"]')].forEach((a) => {
        const id = convIdFromHref(a.getAttribute('href'));
        if (!id) return;
        const r = a.getBoundingClientRect();
        if (r.bottom < navRect.top || r.top > navRect.bottom || r.height === 0) return;
        if (this.hidden.has(id)) return;
        const sel = this.selected.has(id);
        const err = this.errors.has(id);
        if (sel || err || this.hitIds.has(id)) {
          const hl = document.createElement('div');
          hl.className = `hl${this.hitIds.has(id) ? ' hit' : ''}${err ? ' err' : ''}`;
          Object.assign(hl.style, {
            left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
          });
          if (err) hl.title = this.errors.get(id);
          frag.appendChild(hl);
        }
        const cb = document.createElement('div');
        cb.className = `cb${sel ? ' checked' : ''}`;
        cb.style.left = `${r.left + 6}px`;
        cb.style.top = `${r.top + (r.height - 15) / 2}px`;
        if (sel) cb.innerHTML = I.check;
        frag.appendChild(cb);
      });
      // 保留 lasso 元素（若存在）
      const lasso = this.layer.querySelector('.lasso');
      this.layer.replaceChildren(frag);
      if (lasso) this.layer.appendChild(lasso);
      this._updateBar();
    }

    /* ---------- 点击 / Shift / 框选（均不触碰页面 DOM） ---------- */

    _bindGlobalHandlers() {
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
        this._scheduleUpdate();
      }, true);

      this._setupLasso();
    }

    _rangeSelect(fromId, toId) {
      const ids = this._links().map((a) => convIdFromHref(a.getAttribute('href')));
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
          lassoEl.className = 'lasso';
          this.layer.appendChild(lassoEl);
        }
        const x1 = Math.min(start.x, e.clientX);
        const y1 = Math.min(start.y, e.clientY);
        const x2 = Math.max(start.x, e.clientX);
        const y2 = Math.max(start.y, e.clientY);
        Object.assign(lassoEl.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
        this.hitIds.clear();
        this._links().forEach((a) => {
          const r = a.getBoundingClientRect();
          const hit = !(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2);
          if (hit) this.hitIds.add(convIdFromHref(a.getAttribute('href')));
        });
        this._scheduleUpdate();
      }, true);

      document.addEventListener('mouseup', (e) => {
        if (!start) return;
        if (lassoEl) {
          this.hitIds.forEach((id) => {
            if (e.altKey) this.selected.delete(id);
            else this.selected.add(id);
          });
          this.hitIds.clear();
          lassoEl.remove();
          this._scheduleUpdate();
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
      if (!this.enabled || (n === 0 && !this.running)) {
        this.bar.classList.remove('show');
        return;
      }
      this.bar.classList.add('show');
      if (this.running) {
        this.bar.innerHTML = `
          <span class="cnt">${progressText || this._lastProgress || '处理中…'}</span>
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
          this._scheduleUpdate();
        });
      }
    }

    _setProgress(text) {
      this._lastProgress = text;
      this._updateBar(text);
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
      this.errors.clear();
      this._setProgress(`${verbs[action]}中… 0/${total}`);

      this.queue = new B.TaskQueue();
      const tasks = ids.map((id) => ({ id, run: () => fn(id) }));
      const result = await this.queue.run(tasks, {
        onItemDone: (t) => {
          finished++;
          this.selected.delete(t.id);
          this.hidden.add(t.id);
          this._applyHidden();
          this._setProgress(`${verbs[action]}中… ${finished}/${total}`);
          this._scheduleUpdate();
        },
        onItemError: (t, err, willRetry) => {
          if (!willRetry) {
            finished++;
            this.errors.set(t.id, err.message || '操作失败');
            this._setProgress(`${verbs[action]}中… ${finished}/${total}`);
            this._scheduleUpdate();
          }
        },
        onItemRetryWait: (t, waitMs) => {
          this._setProgress(`限速中，${Math.ceil(waitMs / 1000)}s 后重试… ${finished}/${total}`);
        },
      });

      this.running = false;
      this.queue = null;
      this._lastProgress = '';
      this._scheduleUpdate();
      if (result.failed.length > 0) {
        window.alert(`完成 ${result.done.length}，失败 ${result.failed.length}：${result.failed[0].error?.message || '未知错误'}\n失败的会话仍保持选中（红色标记），可重试。`);
      }
    }
  }

  B.SidebarSelect = SidebarSelect;
})();
