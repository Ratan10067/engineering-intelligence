/**
 * Engineering Intelligence Platform — API Client
 *
 * Centralized API client for communicating with the FastAPI backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API Error ${res.status}: ${error}`);
  }

  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────

export interface Repository {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  sync_status: string;
  total_prs_synced: number;
  last_synced_at: string | null;
  created_at: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string | null;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author_name: string;
  committed_at: string | null;
}

export interface CommitDiffResponse {
  sha: string;
  message: string;
  author: string;
  date: string | null;
  stats?: {
    total: number;
    additions: number;
    deletions: number;
  };
  files: ChangedFile[];
}

export interface PullRequest {
  id: number;
  pr_number: number;
  title: string;
  description?: string;
  author: string;
  state: string;
  is_merged: boolean;
  labels: string[];
  milestone: string | null;
  additions: number;
  deletions: number;
  changed_files_count: number;
  created_at: string | null;
  merged_at: string | null;
  html_url: string | null;
  has_knowledge: boolean;
  knowledge?: any;
  commits?: CommitInfo[];
  changed_files?: ChangedFile[];
  reviews?: any[];
}

export interface SearchResult {
  document_id: number;
  pull_request_id: number;
  document_type: string;
  title: string;
  content: string;
  score: number;
  pr_number: number | null;
  author: string | null;
  pr_date: string | null;
  release: string | null;
  components: string[] | null;
  change_types: string[] | null;
  html_url: string | null;
  source: string;
}

export interface EvidenceItem {
  pr_number: number | null;
  title: string;
  author: string | null;
  date: string | null;
  release: string | null;
  relevance_score: number;
  document_type: string;
  components: string[] | null;
  change_types: string[] | null;
  html_url: string | null;
  source: string;
}

export interface QuestionResponse {
  answer: string;
  evidence: EvidenceItem[];
  has_sufficient_evidence: boolean;
  latency: {
    retrieval_ms: number;
    context_ms: number;
    llm_ms: number;
    total_ms: number;
  };
  evidence_tracking: any;
  metadata: any;
}

export interface Stats {
  repositories: number;
  pull_requests: number;
  commits: number;
  changed_files: number;
  reviews: number;
  prs_with_knowledge: number;
  engineering_documents: number;
}

// ── API Functions ────────────────────────────────────────────────────────

export const api = {
  // Repositories
  getRepositories: () => request<Repository[]>('/api/repositories'),

  createRepository: (full_name: string) =>
    request<Repository>('/api/repositories', {
      method: 'POST',
      body: JSON.stringify({ full_name }),
    }),

  getRepository: (id: number) => request<Repository>(`/api/repositories/${id}`),

  // Sync
  syncRepository: (id: number, maxPrs: number = 50) =>
    request<{ status: string; message: string }>(`/api/repositories/${id}/sync`, {
      method: 'POST',
      body: JSON.stringify({ max_prs: maxPrs }),
    }),

  getSyncStatus: (id: number) =>
    request<{ sync_status: string; total_prs_synced: number; last_synced_at: string | null }>(
      `/api/repositories/${id}/status`
    ),

  cancelSync: (id: number) =>
    request<{ status: string; message: string }>(`/api/repositories/${id}/cancel`, {
      method: 'POST',
    }),

  // Live Sync SSE URL
  syncLiveUrl: (id: number, maxPrs: number = 10) =>
    `${API_BASE}/api/repositories/${id}/sync/live?max_prs=${maxPrs}`,

  // Pull Requests
  getPullRequests: (repoId: number, limit = 20, offset = 0) =>
    request<{ items: PullRequest[]; total: number }>(
      `/api/pull-requests?repo_id=${repoId}&limit=${limit}&offset=${offset}`
    ),

  getPullRequest: (id: number) => request<PullRequest>(`/api/pull-requests/${id}`),

  getCommitDiff: (prId: number, sha: string) =>
    request<CommitDiffResponse>(`/api/pull-requests/${prId}/commits/${sha}/diff`),

  // Search
  search: (params: {
    query: string;
    repo_id?: number;
    top_k?: number;
    release?: string;
    components?: string[];
    change_types?: string[];
    author?: string;
  }) =>
    request<{ results: SearchResult[]; total: number; query: string }>('/api/search', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // Questions
  askQuestion: (params: {
    question: string;
    repo_id?: number;
    top_k?: number;
    release?: string;
    components?: string[];
  }) =>
    request<QuestionResponse>('/api/questions', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  askQuestionStream: async (
    params: {
      question: string;
      repo_id?: number;
      top_k?: number;
      release?: string;
      components?: string[];
    },
    callbacks: {
      onEvidence?: (evidence: EvidenceItem[], latency: any) => void;
      onToken?: (token: string) => void;
      onDone?: (response: QuestionResponse) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    const res = await fetch(`${API_BASE}/api/questions/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = new Error(`HTTP error ${res.status}`);
      callbacks.onError?.(err);
      throw err;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === 'evidence') {
              callbacks.onEvidence?.(data.evidence, data.latency);
            } else if (data.type === 'token') {
              callbacks.onToken?.(data.token);
            } else if (data.type === 'done') {
              callbacks.onDone?.(data);
            } else if (data.type === 'error') {
              callbacks.onError?.(new Error(data.message));
            }
          } catch {
            // ignore
          }
        }
      }
    }
  },

  // Stats
  getStats: () => request<Stats>('/api/questions/stats'),

  // Health
  healthCheck: () => request<{ status: string; ollama: string }>('/api/health/detailed'),
};
