/**
 * ChatGPT backend-api 封装。
 * 运行在 chatgpt.com 页面的 content script 中，同源请求自动携带登录 Cookie。
 */
(function () {
  'use strict';

  const BASE = location.origin;

  let cachedToken = null;
  let tokenExpiry = 0;

  class ApiError extends Error {
    constructor(message, status, retryAfterMs) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.retryAfterMs = retryAfterMs;
    }
  }

  async function getAccessToken(force = false) {
    const now = Date.now();
    if (!force && cachedToken && now < tokenExpiry) return cachedToken;
    const res = await fetch(`${BASE}/api/auth/session`, { credentials: 'include' });
    if (!res.ok) throw new ApiError(`获取登录状态失败 (HTTP ${res.status})`, res.status);
    const data = await res.json();
    if (!data || !data.accessToken) {
      throw new ApiError('未登录 ChatGPT，请先登录后重试', 401);
    }
    cachedToken = data.accessToken;
    tokenExpiry = now + 10 * 60 * 1000;
    return cachedToken;
  }

  function parseRetryAfter(res) {
    const h = res.headers.get('retry-after');
    if (!h) return null;
    const s = Number(h);
    if (!Number.isNaN(s)) return s * 1000;
    const d = Date.parse(h);
    return Number.isNaN(d) ? null : Math.max(0, d - Date.now());
  }

  async function apiFetch(path, options = {}) {
    const token = await getAccessToken();
    const res = await fetch(`${BASE}/backend-api${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      cachedToken = null;
      throw new ApiError('登录已过期，请刷新页面重新登录', 401);
    }
    if (res.status === 429) {
      throw new ApiError('请求过于频繁（接口限速）', 429, parseRetryAfter(res));
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).detail || '';
      } catch (_) { /* ignore */ }
      throw new ApiError(`请求失败 (HTTP ${res.status}) ${detail}`.trim(), res.status);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /** 分页获取会话列表；is_archived=true 时获取已归档列表 */
  async function fetchConversations(offset = 0, limit = 50, isArchived = false) {
    const q = `?offset=${offset}&limit=${limit}&order=updated&is_archived=${isArchived}`;
    return apiFetch(`/conversations${q}`);
  }

  /** 获取全部会话（自动翻页），onPage(loaded, total) 用于进度回调 */
  async function fetchAllConversations(isArchived = false, onPage) {
    const items = [];
    let offset = 0;
    const limit = 100;
    let total = Infinity;
    while (offset < total) {
      const page = await fetchConversations(offset, limit, isArchived);
      total = page.total ?? 0;
      items.push(...(page.items || []));
      offset += limit;
      if (onPage) onPage(items.length, total);
      if (!page.items || page.items.length === 0) break;
    }
    return items;
  }

  /** 获取项目（gizmo）列表；接口不存在时返回空数组 */
  async function fetchProjects() {
    let data;
    try {
      data = await apiFetch('/gizmos/snorlax/sidebar?conversations_per_gizmo=0');
    } catch (err) {
      if (err.status === 404) return [];
      throw err;
    }
    const items = data?.items || [];
    return items
      .map((it) => {
        const g = it.gizmo?.gizmo || it.gizmo || it;
        const id = g.id || it.id;
        const title = g.display?.name || g.title || g.name || '(未命名项目)';
        return id ? { id, title } : null;
      })
      .filter(Boolean);
  }

  /** 获取某项目下全部会话（cursor 翻页） */
  async function fetchProjectConversations(gizmoId) {
    const items = [];
    let cursor = null;
    for (let i = 0; i < 50; i++) {
      const q = cursor != null ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const page = await apiFetch(`/gizmos/${gizmoId}/conversations${q}`);
      items.push(...(page?.items || []));
      cursor = page?.cursor ?? null;
      if (cursor == null || !page?.items?.length) break;
    }
    return items;
  }

  /** 删除项目（gizmo） */
  function deleteProject(gizmoId) {
    return apiFetch(`/gizmos/${gizmoId}`, { method: 'DELETE' });
  }

  function deleteConversation(id) {
    return apiFetch(`/conversation/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_visible: false }),
    });
  }

  function archiveConversation(id) {
    return apiFetch(`/conversation/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_archived: true }),
    });
  }

  function unarchiveConversation(id) {
    return apiFetch(`/conversation/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_archived: false }),
    });
  }

  window.CGPTBulk = window.CGPTBulk || {};
  Object.assign(window.CGPTBulk, {
    ApiError,
    getAccessToken,
    fetchConversations,
    fetchAllConversations,
    fetchProjects,
    fetchProjectConversations,
    deleteProject,
    deleteConversation,
    archiveConversation,
    unarchiveConversation,
  });
})();
