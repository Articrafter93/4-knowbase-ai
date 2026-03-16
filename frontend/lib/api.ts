/**
 * KnowBase API client — typed fetch wrapper with auth headers + error handling.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type CollectionSummary = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
};

export type DocumentSummary = {
  id: string;
  title: string;
  source_type: string;
  status: string;
  is_favorite: boolean;
  chunk_count?: number;
  word_count?: number;
  created_at: string;
  tags?: string[];
};

export type DocumentChunk = {
  id: string;
  text: string;
  highlighted_text: string;
  page_number?: number;
  section_title?: string;
};

export type DocumentDetail = DocumentSummary & {
  source_url?: string;
  preview_chunks?: DocumentChunk[];
};

export type DocumentChunksResponse = {
  document: DocumentDetail;
  chunks: DocumentChunk[];
};

export type FavoriteResponse = {
  id: string;
  is_favorite: boolean;
};

export type StatusResponse = {
  id: string;
  status: string;
};

export type IngestJob = {
  document_id: string;
  job_id: string;
  status: string;
  progress: number;
  error_message?: string;
};

export type SearchResult = {
  chunk_id: string;
  document_id: string;
  doc_title: string;
  fragment: string;
  score: number;
  page_number?: number;
  source_type?: string;
  section_title?: string;
  source_url?: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  total: number;
  retrieval_backend: string;
};

export type ConversationSummary = {
  id: string;
  title?: string;
  created_at: string;
  updated_at?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: SearchResult[];
  created_at: string;
  feedback?: "like" | "dislike" | null;
};

export type FeedbackResponse = {
  id: string;
  feedback: string;
  notes?: string;
};

export type MemoryItem = {
  id: string;
  content: string;
  memory_type: string;
  namespace: string;
  importance: number;
  tags?: string[];
  updated_at: string;
  created_at?: string;
};

export type AdminStats = {
  documents: {
    total: number;
    indexed: number;
  };
  ingestion_jobs: {
    active: number;
  };
};

export type AdminJob = {
  id: string;
  document_id: string;
  status: string;
  progress: number;
  error_message?: string;
  created_at: string;
};

export type QueryAnalytics = {
  period_days: number;
  total_queries: number;
  total_tokens: number;
  estimated_cost_usd: number;
  avg_latency_ms: number;
};

export type TopDocument = {
  id: string;
  title: string;
  source_type: string;
  chunk_count: number;
  citation_count: number;
};

export type RetrievalFailure = {
  message_id: string;
  snippet: string;
  created_at: string;
};

export type IndexHealth = {
  documents_by_status: Record<string, number>;
  chunks: {
    total: number;
    embedded: number;
  };
  embedding_coverage: number;
};

export type AdminConfig = {
  rag_prompt: string;
  memory_rule: string;
  retrieval_backend: string;
  top_k: number;
  rerank_top_k: number;
};

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

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new ApiError(0, `API unavailable at ${API_BASE}: ${message}`);
  }
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
    apiFetch<DocumentSummary[]>(
      `/api/v1/library/documents${buildQuery({
        collection_id: collectionId,
        status,
        is_favorite: isFavorite,
      })}`,
    ),
  getDocument: (id: string) => apiFetch<DocumentDetail>(`/api/v1/library/documents/${id}`),
  getDocumentChunks: (id: string, highlightChunkId?: string) =>
    apiFetch<DocumentChunksResponse>(
      `/api/v1/library/documents/${id}/chunks${buildQuery({ highlight_chunk_id: highlightChunkId })}`,
    ),
  toggleFavorite: (id: string) =>
    apiFetch<FavoriteResponse>(`/api/v1/library/documents/${id}/favorite`, { method: "PATCH" }),
  updateDocumentStatus: (id: string, status: string) =>
    apiFetch<StatusResponse>(`/api/v1/library/documents/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  deleteDocument: (id: string) => apiFetch<void>(`/api/v1/library/documents/${id}`, { method: "DELETE" }),
  getCollections: () => apiFetch<CollectionSummary[]>("/api/v1/library/collections"),
  createCollection: (data: { name: string; description?: string; color?: string; icon?: string }) =>
    apiFetch<CollectionSummary>("/api/v1/library/collections", { method: "POST", body: JSON.stringify(data) }),
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
    apiFetch<IngestJob>("/api/v1/ingest/url", {
      method: "POST",
      body: JSON.stringify({ url, collection_id: collectionId, tags: tags || [] }),
    }),
  ingestNote: (title: string, content: string, collectionId?: string, tags?: string[]) =>
    apiFetch<IngestJob>("/api/v1/ingest/note", {
      method: "POST",
      body: JSON.stringify({ title, content, collection_id: collectionId, tags: tags || [] }),
    }),
  getJobStatus: (jobId: string) => apiFetch<IngestJob>(`/api/v1/ingest/jobs/${jobId}`),
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
    apiFetch<SearchResponse>(
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
  listConversations: () => apiFetch<ConversationSummary[]>("/api/v1/chat/conversations"),
  getMessages: (conversationId: string) => apiFetch<ChatMessage[]>(`/api/v1/chat/conversations/${conversationId}/messages`),
  giveFeedback: (messageId: string, feedback: "like" | "dislike", notes?: string) =>
    apiFetch<FeedbackResponse>(`/api/v1/chat/messages/${messageId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ feedback, notes }),
    }),
};

export const memory = {
  list: (namespace?: string) => apiFetch<MemoryItem[]>(`/api/v1/memory/${buildQuery({ namespace })}`),
  create: (content: string, memory_type = "fact", namespace = "general") =>
    apiFetch<MemoryItem>("/api/v1/memory/", {
      method: "POST",
      body: JSON.stringify({ content, memory_type, namespace }),
    }),
  update: (
    id: string,
    data: Partial<Pick<MemoryItem, "content" | "memory_type" | "namespace">>,
  ) =>
    apiFetch<MemoryItem>(`/api/v1/memory/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<void>(`/api/v1/memory/${id}`, { method: "DELETE" }),
};

export const admin = {
  getStats: () => apiFetch<AdminStats>("/api/v1/admin/stats"),
  getJobs: () => apiFetch<AdminJob[]>("/api/v1/admin/jobs"),
  getQueryAnalytics: (days = 30) => apiFetch<QueryAnalytics>(`/api/v1/admin/analytics/queries${buildQuery({ days })}`),
  getTopDocuments: (limit = 10) =>
    apiFetch<TopDocument[]>(`/api/v1/admin/analytics/top-documents${buildQuery({ limit })}`),
  getRetrievalFailures: (limit = 20) =>
    apiFetch<RetrievalFailure[]>(`/api/v1/admin/analytics/retrieval-failures${buildQuery({ limit })}`),
  getIndexHealth: () => apiFetch<IndexHealth>("/api/v1/admin/analytics/index-health"),
  getConfig: () => apiFetch<AdminConfig>("/api/v1/admin/config"),
};
