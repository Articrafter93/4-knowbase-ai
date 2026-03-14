.PHONY: dev stop restart logs migrate test lint clean

# ─── Dev environment ───────────────────────────────────────────────────────────
dev:
	docker compose up --build -d

stop:
	docker compose down

restart:
	docker compose restart backend worker frontend

logs:
	docker compose logs -f backend worker

logs-all:
	docker compose logs -f

# ─── Database ─────────────────────────────────────────────────────────────────
migrate:
	docker compose exec backend alembic upgrade head

migrate-new:
	docker compose exec backend alembic revision --autogenerate -m "$(name)"

migrate-rollback:
	docker compose exec backend alembic downgrade -1

# ─── Backend dev (local, no Docker) ──────────────────────────────────────────
backend-dev:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

backend-install:
	cd backend && pip install -e ".[dev]"

# ─── Frontend dev (local, no Docker) ─────────────────────────────────────────
frontend-dev:
	cd frontend && npm run dev

frontend-install:
	cd frontend && npm install

# ─── Tests ────────────────────────────────────────────────────────────────────
test-backend:
	docker compose exec backend pytest tests/ -v --cov=app --cov-report=term-missing

test-frontend:
	cd frontend && npx playwright test

# ─── Lint ─────────────────────────────────────────────────────────────────────
lint:
	cd backend && ruff check app/ && mypy app/
	cd frontend && npm run lint

# ─── Sample data ──────────────────────────────────────────────────────────────
ingest-sample:
	curl -X POST http://localhost:8000/api/v1/ingest/url \
		-H "Content-Type: application/json" \
		-d '{"url":"https://en.wikipedia.org/wiki/Knowledge_management","collection_id":null}'

# ─── Cleanup ──────────────────────────────────────────────────────────────────
clean:
	docker compose down -v --remove-orphans
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find backend -name "*.pyc" -delete 2>/dev/null || true
