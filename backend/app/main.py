"""
KnowBase Backend — FastAPI Application Entry Point (Phase 3)
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.routers import auth, chat, ingest, library, memory, search, admin
from app.api.routers import sharing, smart_folders
from app.core.config import settings
from app.core.database import create_db_and_tables

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown lifecycle."""
    log.info("Starting KnowBase backend", version="0.3.0", env=settings.ENVIRONMENT)
    await create_db_and_tables()

    # Phase 3: OpenTelemetry instrumentation
    try:
        from app.core.telemetry import setup_tracing
        setup_tracing(app)
        log.info("OpenTelemetry tracing initialized")
    except Exception as exc:
        log.warning("OTel setup failed (non-fatal)", error=str(exc))

    yield
    log.info("Shutting down KnowBase backend")


app = FastAPI(
    title="KnowBase API",
    description="AI-powered personal knowledge base — RAG, memory and hybrid retrieval.",
    version="0.3.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── Routers (all phases) ──────────────────────────────────────────────────────
PREFIX = "/api/v1"
app.include_router(auth.router,          prefix=f"{PREFIX}/auth",          tags=["auth"])
app.include_router(library.router,       prefix=f"{PREFIX}/library",       tags=["library"])
app.include_router(ingest.router,        prefix=f"{PREFIX}/ingest",        tags=["ingest"])
app.include_router(chat.router,          prefix=f"{PREFIX}/chat",          tags=["chat"])
app.include_router(memory.router,        prefix=f"{PREFIX}/memory",        tags=["memory"])
app.include_router(search.router,        prefix=f"{PREFIX}/search",        tags=["search"])
app.include_router(admin.router,         prefix=f"{PREFIX}/admin",         tags=["admin"])
# Phase 3
app.include_router(sharing.router,       prefix=f"{PREFIX}/sharing",       tags=["sharing"])
app.include_router(smart_folders.router, prefix=f"{PREFIX}/smart-folders", tags=["smart-folders"])


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "service": "knowbase-backend", "version": "0.3.0"}

