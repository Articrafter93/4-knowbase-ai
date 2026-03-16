# EVIDENCE — Functional Pass (2026-03-16)

Run ID: `20260316-123807`  
Stack: Docker Compose (`frontend`, `backend`, `postgres`, `qdrant`, `redis`, `worker`)  
Evidence folder: `evidence/functional-pass/`

## 1) `GET /health` -> `200`

- Terminal capture: [`evidence/functional-pass/health-http.txt`](./evidence/functional-pass/health-http.txt)
- Body capture: [`evidence/functional-pass/health-body.json`](./evidence/functional-pass/health-body.json)

Result:
- `GET /health -> HTTP 200`

## 2) `POST /api/v1/ingest/note` -> `202` + job `completed`

API run artifact: [`evidence/functional-pass/api-run-20260316-123807.json`](./evidence/functional-pass/api-run-20260316-123807.json)
Quick summary: [`evidence/functional-pass/api-run-20260316-123807-summary.txt`](./evidence/functional-pass/api-run-20260316-123807-summary.txt)

Verified fields:
- `ingest.status_code = 202`
- `ingest.response.job_id = 93660e1e-2cdb-49fc-b58b-b60b8e1011db`
- `job.final_status = completed`
- `job.admin_job.status = completed`
- `job.admin_job.progress = 100`

## 3) Document appears in `/library`

Verified in API evidence:
- `library.document_found = true`
- `library.document.id = 8a4825a8-f412-4ffb-9e5c-54b897312ba2`
- `library.document.title = "Evidence Note 20260316-123807"`

Visual evidence:
- [`evidence/functional-pass/screenshot-1-sidebar-library.png`](./evidence/functional-pass/screenshot-1-sidebar-library.png)

## 4) `/chat` response with visible citation + link to source chunk

Verified in API evidence:
- `chat.citation_count = 1`
- Citation points to:
  - `document_id = 8a4825a8-f412-4ffb-9e5c-54b897312ba2`
  - `chunk_id = b5973371-7914-4dd8-ab67-a3730a24d30f`

Visual evidence:
- Chat with citation visible + right panel with `Open linked chunk`:
  - [`evidence/functional-pass/screenshot-2-chat-citation.png`](./evidence/functional-pass/screenshot-2-chat-citation.png)
- Document page opened from citation link with highlighted fragment:
  - [`evidence/functional-pass/screenshot-3-document-highlight.png`](./evidence/functional-pass/screenshot-3-document-highlight.png)

## 5) Three required frontend screenshots

1. Sidebar + collections/library view:  
   [`evidence/functional-pass/screenshot-1-sidebar-library.png`](./evidence/functional-pass/screenshot-1-sidebar-library.png)
2. Chat with cited answer and chunk link:  
   [`evidence/functional-pass/screenshot-2-chat-citation.png`](./evidence/functional-pass/screenshot-2-chat-citation.png)
3. Document view with highlighted cited fragment:  
   [`evidence/functional-pass/screenshot-3-document-highlight.png`](./evidence/functional-pass/screenshot-3-document-highlight.png)

## 6) `npm run check` and `npm run test:smoke` clean + frontend build

Logs:
- Frontend deps install: [`evidence/functional-pass/npm-frontend-install.log`](./evidence/functional-pass/npm-frontend-install.log)
- Frontend production build: [`evidence/functional-pass/npm-frontend-build.log`](./evidence/functional-pass/npm-frontend-build.log)
- Workspace check: [`evidence/functional-pass/npm-check.log`](./evidence/functional-pass/npm-check.log)
- Smoke tests: [`evidence/functional-pass/npm-test-smoke.log`](./evidence/functional-pass/npm-test-smoke.log)

Results:
- `npm --prefix frontend install --no-audit --no-fund` -> passed
- `npm --prefix frontend run build` -> passed
- `npm run check` -> passed
- `npm run test:smoke` -> `Smoke checks passed.`

## Extra operational evidence

- Docker services state at capture time: [`evidence/functional-pass/docker-compose-ps.txt`](./evidence/functional-pass/docker-compose-ps.txt)
