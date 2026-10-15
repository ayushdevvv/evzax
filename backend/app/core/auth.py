from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

from fastapi import HTTPException, Request, status
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.core.config import settings
from app.db.mongo import get_db

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_AUTH_WINDOW = timedelta(minutes=15)
_AUTH_MAX_ATTEMPTS = 8


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _unb64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _secret() -> bytes:
    value = settings.auth_jwt_secret
    if not value or len(value) < 32 or value.lower() in {"replace_me", "change_me", "your-secret"}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sign in is temporarily unavailable. Please try again later.",
        )
    return value.encode("utf-8")


@lru_cache(maxsize=1)
def _ensure_indexes_marker() -> bool:
    db = get_db()
    db.users.create_index([("email", ASCENDING)], unique=True, name="users_email_unique")
    db.auth_sessions.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0, name="auth_sessions_expiry_ttl")
    db.auth_attempts.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0, name="auth_attempts_expiry_ttl")
    db.auth_attempts.create_index([("email_hash", ASCENDING), ("ip_hash", ASCENDING), ("created_at", DESCENDING)], name="auth_attempts_lookup")
    return True


def validate_email(value: str) -> str:
    email = value.strip().lower()
    if len(email) > 320 or not _EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return email


def _hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32, maxmem=64 * 1024 * 1024)
    return _b64url(salt), _b64url(digest)


def _verify_password(password: str, salt_text: str, expected: str) -> bool:
    try:
        salt = _unb64url(salt_text)
        _, actual = _hash_password(password, salt)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _password_hash_for_storage(password: str) -> tuple[str, str]:
    return _hash_password(password)


def _issue_jwt(user_id: str, jti: str, expires_at: int) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64url(json.dumps({
        "sub": user_id,
        "jti": jti,
        "iss": settings.auth_jwt_issuer,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": expires_at,
    }, separators=(",", ":")).encode())
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = _b64url(hmac.new(_secret(), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def _decode_jwt(token: str) -> dict[str, Any] | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_text, payload_text, signature_text = parts
        header = json.loads(_unb64url(header_text))
        payload = json.loads(_unb64url(payload_text))
        if header.get("alg") != "HS256" or header.get("typ") != "JWT":
            return None
        signing_input = f"{header_text}.{payload_text}".encode("ascii")
        expected = _b64url(hmac.new(_secret(), signing_input, hashlib.sha256).digest())
        if not hmac.compare_digest(signature_text, expected):
            return None
        now = int(datetime.now(timezone.utc).timestamp())
        if payload.get("iss") != settings.auth_jwt_issuer or int(payload.get("exp", 0)) <= now:
            return None
        if not payload.get("sub") or not payload.get("jti"):
            return None
        return payload
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, HTTPException):
        return None


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()


def _request_ip(request: Request) -> str:
    if settings.auth_trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
        if hops:
            return hops[-1]
    return request.client.host if request.client else "unknown"


def _record_failed_login(email: str, request: Request) -> None:
    db = get_db()
    now = datetime.now(timezone.utc)
    email_hash = _digest(email)
    ip_hash = _digest(_request_ip(request))
    db.auth_attempts.insert_one({
        "_id": uuid.uuid4().hex,
        "email_hash": email_hash,
        "ip_hash": ip_hash,
        "created_at": now,
        "expires_at": now + _AUTH_WINDOW,
    })


def _clear_failed_logins(email: str, request: Request) -> None:
    try:
        get_db().auth_attempts.delete_many({"email_hash": _digest(email), "ip_hash": _digest(_request_ip(request))})
    except PyMongoError:
        return


_DECOY_SALT = b"evzax-decoy-salt!"


def _check_login_limit(email: str, request: Request) -> None:
    _ensure_indexes_marker()
    cutoff = datetime.now(timezone.utc) - _AUTH_WINDOW
    count = get_db().auth_attempts.count_documents({
        "email_hash": _digest(email),
        "ip_hash": _digest(_request_ip(request)),
        "created_at": {"$gte": cutoff},
    })
    if count >= _AUTH_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many sign in attempts. Wait a few minutes and try again.")


def create_account(name: str, email: str, password: str) -> dict:
    _secret()
    _ensure_indexes_marker()
    clean_name = " ".join(name.split())
    if len(clean_name) < 2 or len(clean_name) > 80:
        raise HTTPException(status_code=422, detail="Enter a name between 2 and 80 characters.")
    if not 8 <= len(password) <= 128:
        raise HTTPException(status_code=422, detail="Use a password between 8 and 128 characters.")
    normalized_email = validate_email(email)
    salt_text, password_hash = _password_hash_for_storage(password)
    now = datetime.now(timezone.utc)
    user = {
        "_id": uuid.uuid4().hex,
        "name": clean_name,
        "email": normalized_email,
        "password_salt": salt_text,
        "password_hash": password_hash,
        "created_at": now,
        "updated_at": now,
    }
    try:
        get_db().users.insert_one(user)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from exc
    return {"id": user["_id"], "name": user["name"], "email": user["email"]}


def authenticate_account(email: str, password: str, request: Request) -> dict:
    _secret()
    normalized_email = validate_email(email)
    _check_login_limit(normalized_email, request)
    db = get_db()
    user = db.users.find_one({"email": normalized_email})
    if user:
        good = _verify_password(password, user.get("password_salt", ""), user.get("password_hash", ""))
    else:
        _hash_password(password, _DECOY_SALT)
        good = False
    if not good:
        _record_failed_login(normalized_email, request)
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    _clear_failed_logins(normalized_email, request)
    return {"id": user["_id"], "name": user["name"], "email": user["email"]}


def start_session(user: dict) -> tuple[str, str, datetime]:
    _secret()
    _ensure_indexes_marker()
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(minutes=settings.auth_session_minutes)
    jti = uuid.uuid4().hex
    token = _issue_jwt(user["id"], jti, int(expiry.timestamp()))
    get_db().auth_sessions.insert_one({
        "_id": jti,
        "user_id": user["id"],
        "created_at": now,
        "expires_at": expiry,
        "revoked": False,
    })
    return token, jti, expiry


def user_from_token(token: str | None) -> dict | None:
    if not token:
        return None
    payload = _decode_jwt(token)
    if not payload:
        return None
    try:
        _ensure_indexes_marker()
        now = datetime.now(timezone.utc)
        session = get_db().auth_sessions.find_one({
            "_id": payload["jti"], "user_id": payload["sub"], "revoked": {"$ne": True}, "expires_at": {"$gt": now},
        })
        if not session:
            return None
        user = get_db().users.find_one({"_id": payload["sub"]}, {"name": 1, "email": 1})
        if not user:
            return None
        return {"id": user["_id"], "name": user.get("name", "Developer"), "email": user.get("email", "") , "session_id": payload["jti"]}
    except PyMongoError:
        raise HTTPException(status_code=503, detail="Sign in is temporarily unavailable. Please try again later.")


def current_user(request: Request) -> dict:
    token = request.cookies.get(settings.auth_cookie_name)
    user = user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return user


def optional_user(request: Request) -> dict | None:
    token = request.cookies.get(settings.auth_cookie_name)
    return user_from_token(token)


def revoke_session(token: str | None) -> None:
    payload = _decode_jwt(token) if token else None
    if payload:
        try:
            get_db().auth_sessions.update_one({"_id": payload["jti"], "user_id": payload["sub"]}, {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc)}})
        except PyMongoError:
            return
