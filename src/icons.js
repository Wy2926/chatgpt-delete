/**
 * 内联 SVG 图标集（24px 网格、2px 描边、currentColor），ChatGPT 风格。
 */
(function () {
  'use strict';

  const S = (inner, viewBox = '0 0 24 24') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em" aria-hidden="true">${inner}</svg>`;

  const ICONS = {
    /** 主图标：六边形花环轮廓 + 会话线与勾选 */
    logo: S(
      '<path d="M12 2.5l7.8 4.5v9l-7.8 4.5-7.8-4.5v-9z"/>' +
      '<path d="M8 9.5h8M8 12.5h4.5"/>' +
      '<path d="M14.5 15.5l1.7 1.7 3-3.2" stroke-width="1.8"/>'
    ),
    trash: S(
      '<path d="M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/>' +
      '<path d="M6 7l1 12a2 2 0 0 0 2 1.8h6A2 2 0 0 0 17 19l1-12"/>' +
      '<path d="M10 11v6M14 11v6"/>'
    ),
    archive: S(
      '<rect x="3" y="4" width="18" height="5" rx="1"/>' +
      '<path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/>' +
      '<path d="M12 12v5M9.5 14.5L12 17l2.5-2.5"/>'
    ),
    unarchive: S(
      '<rect x="3" y="4" width="18" height="5" rx="1"/>' +
      '<path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/>' +
      '<path d="M12 17v-5M9.5 14.5L12 12l2.5 2.5"/>'
    ),
    folder: S(
      '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'
    ),
    retry: S(
      '<path d="M3 12a9 9 0 1 0 2.6-6.4"/>' +
      '<path d="M5 3v4h4"/>'
    ),
    pause: S('<path d="M9 5v14M15 5v14"/>'),
    play: S('<path d="M7 5l12 7-12 7z"/>'),
    stop: S('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
    minimize: S('<path d="M5 12h14"/>'),
    close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
    lasso: S(
      '<path d="M4 6V5a1 1 0 0 1 1-1h1M10 4h4M18 4h1a1 1 0 0 1 1 1v1M20 10v4M20 18v1a1 1 0 0 1-1 1h-1M14 20h-4M6 20H5a1 1 0 0 1-1-1v-1M4 14v-4"/>'
    ),
    check: S('<path d="M4.5 12.5l5 5 10-11"/>'),
    warn: S(
      '<path d="M12 3l10 18H2z"/>' +
      '<path d="M12 10v5M12 18.2v.1"/>'
    ),
    refresh: S(
      '<path d="M21 12a9 9 0 1 1-2.6-6.4"/>' +
      '<path d="M19 3v4h-4"/>'
    ),
  };

  window.CGPTBulk = window.CGPTBulk || {};
  window.CGPTBulk.ICONS = ICONS;
})();
