/** 入口：在 ChatGPT 页面挂载批量管理面板。 */
(function () {
  'use strict';
  if (window.__cgptBulkMounted) return;
  window.__cgptBulkMounted = true;
  const mount = () => {
    new window.CGPTBulk.Panel();
    new window.CGPTBulk.SidebarSelect();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
