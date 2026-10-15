from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import HTTPException, Request, status
from jwt import InvalidTokenError

from app.core.config import settings

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
SCRYPT_N = 1 << 14
SCRYPT_R = 8
SCRYPT_P = 1


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if len(normalized) > 254 or not EMAIL_RE.fullmatch(normalized):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return normalized


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    if len(password) < 8 or len(password) > 128:
        raise HTTPException(status_code=422, detail="Password must be between 8 and 128 characters.")
    actual_salt = salt or secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=actual_salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=64)
    return actual_salt.hex(), derived.hex()


def verify_password(password: str, salt_hex: str, expected_hex: str) -> bool:
    try:
        _salt, actual = hash_password(password, bytes.fromhex(salt_hex))
    except (ValueError, HTTPException):
        return False
    return hmac.compare_digest(actual, expected_hex)


def _jwt_secret() -> str:
    secret = settings.jwt_secret_key.strip()
    if len(secret) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured. Set JWT_SECRET_KEY to a random secret of at least 32 characters in backend/.env, then restart the API.",
        )
    return secret


def create_access_token(user: dict[str, Any]) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=settings.jwt_exp_minutes)
    payload = {
        "sub": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "iss": settings.jwt_issuer,
        "iat": now,
        "exp": expires,
        "jti": secrets.token_urlsafe(16),
        "sv": int(user.get("session_version", 1)),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256"), int((expires - now).total_seconds())


def safe_user(user: dict[str, Any]) -> dict[str, str]:
    return {"id": str(user.get("_id", "")), "name": str(user.get("name", "")), "email": str(user.get("email", ""))}


def set_session_cookie(response, token: str, max_age: int | None = None) -> None:
    same_site = settings.auth_cookie_samesite.lower().strip()
    if same_site not in {"lax", "strict", "none"}:
        same_site = "lax"
    secure = bool(settings.auth_cookie_secure or same_site == "none")
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=max_age if max_age is not None else max(0, int(settings.jwt_exp_minutes * 60)),
        httponly=True,
        secure=secure,
        samesite=same_site,
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


def clear_session_cookie(response) -> None:
    same_site = settings.auth_cookie_samesite.lower().strip()
    if same_site not in {"lax", "strict", "none"}:
        same_site = "lax"
    response.delete_cookie(
        key=settings.auth_cookie_name,
        path="/",
        secure=bool(settings.auth_cookie_secure or same_site == "none"),
        httponly=True,
        samesite=same_site,
    )
    response.headers["Cache-Control"] = "no-store"


def get_current_user(request: Request) -> dict[str, Any]:
    token = request.cookies.get(settings.auth_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=["HS256"], issuer=settings.jwt_issuer, options={"require": ["exp", "iat", "iss", "sub"]})
        user_id = str(payload.get("sub") or "")
        if not user_id:
            raise InvalidTokenError("Missing subject")
    except HTTPException:
        raise
    except InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session has expired. Sign in again.") from exc

    try:
        from app.db.mongo import get_db
        user = get_db().users.find_one({"_id": user_id, "status": {"$ne": "disabled"}})
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Authentication storage is unavailable. Check MongoDB Atlas connectivity.") from exc
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session is no longer valid. Sign in again.")
    try:
        version_is_current = int(payload.get("sv", 0)) == int(user.get("session_version", 1))
    except (TypeError, ValueError):
        version_is_current = False
    if not version_is_current:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This session has been revoked. Sign in again.")
    return user


def check_request_origin(request: Request) -> None:
    """Reject cross-origin state changes to reduce cookie-based CSRF risk."""
    origin = request.headers.get("origin")
    if not origin:
        return
    allowed = {part.strip().rstrip("/") for part in settings.frontend_origin.split(",") if part.strip()}
    if origin.rstrip("/") not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This request origin is not allowed.")
