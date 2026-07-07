/**
 * 侧边栏同步：删除 / 归档成功后，把 ChatGPT 侧边栏中对应的会话行实时隐藏
 * （仅设置 display:none，不增删 React 节点）。React 重渲染可能重建节点，
 * 通过 MutationObserver + 轮询持续重新应用。
 */
(function () {
  'use strict';

  const B = (window.CGPTBulk = window.CGPTBulk || {});

  const convIdFromHref = (href) => {
    const m = /\/c\/([a-z0-9-]+)/i.exec(href || '');
    return m ? m[1] : null;
  };

  class SidebarSync {
    constructor() {
      this.hidden = new Set();
      this._raf = 0;
      const schedule = () => {
        if (this.hidden.size === 0 || this._raf) return;
        this._raf = requestAnimationFrame(() => {
          this._raf = 0;
          this._apply();
        });
      };
      this.observer = new MutationObserver(schedule);
      this.observer.observe(document.body, { childList: true, subtree: true });
      setInterval(schedule, 1500);
      B.sidebarSync = (ids) => {
        ids.forEach((id) => this.hidden.add(id));
        this._apply();
      };
    }

    _apply() {
      if (this.hidden.size === 0) return;
      document.querySelectorAll('a[href*="/c/"]').forEach((a) => {
        const id = convIdFromHref(a.getAttribute('href'));
        if (id && this.hidden.has(id)) {
          const row = a.closest('li') || a;
          if (row.style.display !== 'none') row.style.setProperty('display', 'none', 'important');
        }
      });
    }
  }

  B.SidebarSync = SidebarSync;
})();
