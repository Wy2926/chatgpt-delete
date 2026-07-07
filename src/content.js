/**
 * 入口：等待 ChatGPT（Next.js/React）完成 hydration 后再挂载 UI，
 * 避免在 React 接管 DOM 期间插入节点导致 hydration 不匹配（React #418）
 * 并被 React 恢复渲染时移除。挂载后定期检查宿主节点是否仍在文档中，
 * 若被移除则自动重挂。
 */
(function () {
  'use strict';
  if (window.__cgptBulkMounted) return;
  window.__cgptBulkMounted = true;

  const HYDRATION_GRACE_MS = 1500;

  const afterLoad = (fn) => {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn, { once: true });
  };

  const mount = () => {
    const panel = new window.CGPTBulk.Panel();
    new window.CGPTBulk.SidebarSync();
    // React 若重建页面（如客户端全量重渲染）会清掉外部节点，定期检查并重挂
    setInterval(() => {
      if (document.body && !panel.host.isConnected) document.body.appendChild(panel.host);
    }, 2000);
  };

  afterLoad(() => setTimeout(mount, HYDRATION_GRACE_MS));
})();
