/**
 * KnowBase API client — typed fetch wrapper with auth headers + error handling.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kb_access_token");
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null | string[]>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item) query.append(key, item);
      });
      continue;
    }
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.Authorization = `Bearer ${getToken()}`;
      const retry = await fetch(`${API_BASE}${path}`, { ...options, headers });
      if (!retry.ok) throw new ApiError(retry.status, await retry.text());
      return retry.status === 204 ? (undefined as T) : retry.json();
    }
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Unauthorized");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

async function tryRefresh(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const refreshToken = localStorage.getItem("kb_refresh_token");
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    localStorage.setItem("kb_access_token", data.access_token);
    localStorage.setItem("kb_refresh_token", data.refresh_token);
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

export const auth = {
  register: (email: string, full_name: string, password: string) =>
    apiFetch<{ access_token: string; refresh_token: string }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, full_name, password }),
    }),
  login: (email: string, password: string) =>
    apiFetch<{ access_token: string; refresh_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
};

export const library = {
  getDocuments: (collectionId?: string, status?: string, isFavorite?: boolean) =>
    apiFetch<any[]>(
      `/api/v1/library/documents${buildQuery({
        collection_id: collectionId,
        status,
        is_favorite: isFavorite,
      })}`,
    ),
  getDocument: (id: string) => apiFetch<any>(`/api/v1/library/documents/${id}`),
  getDocumentChunks: (id: string, highlightChunkId?: string) =>
    apiFetch<any>(
      `/api/v1/library/documents/${id}/chunks${buildQuery({ highlight_chunk_id: highlightChunkId })}`,
    ),
  toggleFavorite: (id: string) =>
    apiFetch<any>(`/api/v1/library/documents/${id}/favorite`, { method: "PATCH" }),
  updateDocumentStatus: (id: string, status: string) =>
    apiFetch<any>(`/api/v1/library/documents/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  deleteDocument: (id: string) => apiFetch<void>(`/api/v1/library/documents/${id}`, { method: "DELETE" }),
  getCollections: () => apiFetch<any[]>("/api/v1/library/collections"),
  createCollection: (data: { name: string; description?: string; color?: string; icon?: string }) =>
    apiFetch<any>("/api/v1/library/collections", { method: "POST", body: JSON.stringify(data) }),
};

export const ingest = {
  uploadFile: async (file: File, collectionId?: string, tags?: string[]) => {
    const token = getToken();
    const body = new FormData();
    body.append("file", file);
    if (collectionId) body.append("collection_id", collectionId);
    if (tags?.length) body.append("tags", tags.join(","));
    const response = await fetch(`${API_BASE}/api/v1/ingest/file`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    if (!response.ok) throw new ApiError(response.status, await response.text());
    return response.json();
  },
  ingestUrl: (url: string, collectionId?: string, tags?: string[]) =>
    apiFetch<any>("/api/v1/ingest/url", {
      method: "POST",
      body: JSON.stringify({ url, collection_id: collectionId, tags: tags || [] }),
    }),
  ingestNote: (title: string, content: string, collectionId?: string, tags?: string[]) =>
    apiFetch<any>("/api/v1/ingest/note", {
      method: "POST",
      body: JSON.stringify({ title, content, collection_id: collectionId, tags: tags || [] }),
    }),
  getJobStatus: (jobId: string) => apiFetch<any>(`/api/v1/ingest/jobs/${jobId}`),
};

export const search = {
  query: (params: {
    q: string;
    collectionId?: string;
    topK?: number;
    tags?: string[];
    sourceType?: string;
    dateFrom?: string;
    dateTo?: string;
  }) =>
    apiFetch<any>(
      `/api/v1/search${buildQuery({
        q: params.q,
        collection_id: params.collectionId,
        top_k: params.topK ?? 10,
        tags: params.tags || [],
        source_type: params.sourceType,
        date_from: params.dateFrom,
        date_to: params.dateTo,
      })}`,
    ),
};

export const chat = {
  stream: async (body: {
    query: string;
    conversation_id?: string;
    collection_id?: string;
    tags?: string[];
    date_from?: string;
    date_to?: string;
    top_k?: number;
  }) => {
    const token = getToken();
    const response = await fetch(`${API_BASE}/api/v1/chat/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new ApiError(response.status, await response.text());
    return response;
  },
  listConversations: () => apiFetch<any[]>("/api/v1/chat/conversations"),
  getMessages: (conversationId: string) => apiFetch<any[]>(`/api/v1/chat/conversations/${conversationId}/messages`),
  giveFeedback: (messageId: string, feedback: "like" | "dislike", notes?: string) =>
    apiFetch<any>(`/api/v1/chat/messages/${messageId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ feedback, notes }),
    }),
};

export const memory = {
  list: (namespace?: string) => apiFetch<any[]>(`/api/v1/memory/${buildQuery({ namespace })}`),
  create: (content: string, memory_type = "fact", namespace = "general") =>
    apiFetch<any>("/api/v1/memory/", {
      method: "POST",
      body: JSON.stringify({ content, memory_type, namespace }),
    }),
  update: (id: string, data: any) =>
    apiFetch<any>(`/api/v1/memory/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<void>(`/api/v1/memory/${id}`, { method: "DELETE" }),
};

export const admin = {
  getStats: () => apiFetch<any>("/api/v1/admin/stats"),
  getJobs: () => apiFetch<any[]>("/api/v1/admin/jobs"),
  getQueryAnalytics: (days = 30) => apiFetch<any>(`/api/v1/admin/analytics/queries${buildQuery({ days })}`),
  getTopDocuments: (limit = 10) =>
    apiFetch<any[]>(`/api/v1/admin/analytics/top-documents${buildQuery({ limit })}`),
  getRetrievalFailures: (limit = 20) =>
    apiFetch<any[]>(`/api/v1/admin/analytics/retrieval-failures${buildQuery({ limit })}`),
  getIndexHealth: () => apiFetch<any>("/api/v1/admin/analytics/index-health"),
  getConfig: () => apiFetch<any>("/api/v1/admin/config"),
};
