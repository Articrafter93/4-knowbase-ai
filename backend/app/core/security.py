"""
JWT creation/validation and password hashing.
"""
from datetime import datetime, timedelta, timezone
import hashlib
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def _normalize_password(plain: str) -> bytes:
    # Pre-hash to avoid bcrypt's 72-byte input limit while keeping deterministic verification.
    return hashlib.sha256(plain.encode("utf-8")).hexdigest().encode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_normalize_password(plain), hashed.encode("utf-8"))


def hash_password(plain: str) -> str:
    hashed = bcrypt.hashpw(_normalize_password(plain), bcrypt.gensalt())
    return hashed.decode("utf-8")


def _create_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    data = {"sub": subject, "type": "access", **(extra or {})}
    return _create_token(data, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(subject: str) -> str:
    data = {"sub": subject, "type": "refresh"}
    return _create_token(data, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))


def decode_token(token: str) -> dict[str, Any]:
    """Raises JWTError if invalid or expired."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


__all__ = [
    "verify_password",
    "hash_password",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "JWTError",
]
