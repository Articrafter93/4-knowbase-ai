"""
Application configuration via Pydantic Settings.
All values come from environment variables / .env file — never hardcoded.
"""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    APP_NAME: str = "KnowBase"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://knowbase:changeme@localhost:5432/knowbase"

    # ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Qdrant ───────────────────────────────────────────────────────────────
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION: str = "knowbase_chunks"

    # ── Security / JWT ───────────────────────────────────────────────────────
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── AI / LLM ─────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    LLM_PRIMARY_MODEL: str = "gpt-4o"
    LLM_ROUTING_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 1536

    # ── Ingestion ────────────────────────────────────────────────────────────
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64
    MAX_FILE_SIZE_MB: int = 50
    UPLOAD_DIR: str = "./uploads"

    # ── Retrieval ────────────────────────────────────────────────────────────
    RETRIEVAL_TOP_K: int = 20
    RERANK_TOP_K: int = 6
    RETRIEVAL_BACKEND: str = "hybrid"  # pgvector | qdrant | hybrid

    # ── Phase 3: Embeddings ──────────────────────────────────────────────────
    EMBEDDING_BACKEND: str = "openai"          # openai | fastembed
    FASTEMBED_MODEL: str = "BAAI/bge-small-en-v1.5"

    # ── Phase 3: Audio ──────────────────────────────────────────────────────
    AUDIO_BACKEND: str = "openai_whisper"     # openai_whisper | local_whisper

    # ── Phase 3: Observability ───────────────────────────────────────────────
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""     # e.g. http://tempo:4317
    LANGSMITH_API_KEY: str = ""
    LANGSMITH_PROJECT: str = "knowbase"



@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
