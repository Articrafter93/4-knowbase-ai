/**
 * KnowBase API client — typed fetch wrapper with auth headers + error handling.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('kb_access_token');
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (response.status === 401) {
    // Attempt refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getToken()}`;
      const retry = await fetch(`${API_BASE}${path}`, { ...options, headers });
      if (!retry.ok) throw new ApiError(retry.status, await retry.text());
      return retry.json();
    }
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function tryRefresh(): Promise<boolean> {
  const rt = localStorage.getItem('kb_refresh_token');
  if (!rt) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('kb_access_token', data.access_token);
    localStorage.setItem('kb_refresh_token', data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  register: (email: string, full_name: string, password: string) =>
    apiFetch<{ access_token: string; refresh_token: string }>('/api/v1/auth/register', {
      method: 'POST', body: JSON.stringify({ email, full_name, password }),
    }),
  login: (email: string, password: string) =>
    apiFetch<{ access_token: string; refresh_token: string }>('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
};

// ── Library ───────────────────────────────────────────────────────────────────
export const library = {
  getDocuments: (collectionId?: string, status?: string, isFavorite?: boolean) => {
    const params: any = {};
    if (collectionId) params.collection_id = collectionId;
    if (status) params.status = status;
    if (isFavorite !== undefined) params.is_favorite = isFavorite;
    const qs = new URLSearchParams(params).toString();
    return apiFetch<any[]>(`/api/v1/library/documents${qs ? '?' + qs : ''}`);
  },
  getDocument: (id: string) => apiFetch<any>(`/api/v1/library/documents/${id}`),
  toggleFavorite: (id: string) =>
    apiFetch<any>(`/api/v1/library/documents/${id}/favorite`, { method: 'PATCH' }),
  updateDocumentStatus: (id: string, status: string) =>
    apiFetch<any>(`/api/v1/library/documents/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteDocument: (id: string) =>
    apiFetch<void>(`/api/v1/library/documents/${id}`, { method: 'DELETE' }),
  getCollections: () => apiFetch<any[]>('/api/v1/library/collections'),
  createCollection: (data: { name: string; description?: string; color?: string }) =>
    apiFetch<any>('/api/v1/library/collections', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Ingest ────────────────────────────────────────────────────────────────────
export const ingest = {
  uploadFile: (file: File, collectionId?: string) => {
    const token = getToken();
    const fd = new FormData();
    fd.append('file', file);
    if (collectionId) fd.append('collection_id', collectionId);
    return fetch(`${API_BASE}/api/v1/ingest/file`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }).then(r => r.json());
  },
  ingestUrl: (url: string, collectionId?: string) =>
    apiFetch<any>('/api/v1/ingest/url', {
      method: 'POST', body: JSON.stringify({ url, collection_id: collectionId }),
    }),
  getJobStatus: (jobId: string) => apiFetch<any>(`/api/v1/ingest/jobs/${jobId}`),
};

// ── Search ────────────────────────────────────────────────────────────────────
export const search = {
  query: (q: string, collectionId?: string, topK = 10) => {
    const qs = new URLSearchParams({ q, ...(collectionId ? { collection_id: collectionId } : {}), top_k: String(topK) }).toString();
    return apiFetch<any>(`/api/v1/search?${qs}`);
  },
};

// ── Chat ──────────────────────────────────────────────────────────────────────
export const chat = {
  giveFeedback: (messageId: string, feedback: 'like' | 'dislike', notes?: string) =>
    apiFetch<any>(`/api/v1/chat/messages/${messageId}/feedback`, {
      method: 'POST', body: JSON.stringify({ feedback, notes }),
    }),
};

// ── Memory ────────────────────────────────────────────────────────────────────
export const memory = {
  list: (namespace?: string) => {
    const qs = namespace ? `?namespace=${namespace}` : '';
    return apiFetch<any[]>(`/api/v1/memory/${qs}`);
  },
  create: (content: string, memory_type = 'fact', namespace = 'general') =>
    apiFetch<any>('/api/v1/memory/', { method: 'POST', body: JSON.stringify({ content, memory_type, namespace }) }),
  update: (id: string, data: any) =>
    apiFetch<any>(`/api/v1/memory/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    apiFetch<void>(`/api/v1/memory/${id}`, { method: 'DELETE' }),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const admin = {
  getStats: () => apiFetch<any>('/api/v1/admin/stats'),
  getJobs: () => apiFetch<any[]>('/api/v1/admin/jobs'),
};
