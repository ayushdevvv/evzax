from datetime import datetime, timezone
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.core.config import settings
from app.db.mongo import get_db
from app.models.schemas import SignInRequest, SignUpRequest
from app.security.auth import (
    check_request_origin,
    clear_session_cookie,
    create_access_token,
    get_current_user,
    hash_password,
    normalize_email,
    safe_user,
    set_session_cookie,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
_USERS_INDEX_READY = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _users_collection():
    global _USERS_INDEX_READY
    users = get_db().users
    if not _USERS_INDEX_READY:
        users.create_index("email", unique=True, name="users_email_unique")
        _USERS_INDEX_READY = True
    return users


def _issue(response: Response, user: dict):
    token, max_age = create_access_token(user)
    set_session_cookie(response, token, max_age)
    return {"user": safe_user(user)}


@router.post("/signup", status_code=201)
def signup(payload: SignUpRequest, request: Request, response: Response):
    check_request_origin(request)
    email = normalize_email(payload.email)
    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Name must contain at least 2 characters.")
    salt, password_hash = hash_password(payload.password)
    user = {
        "_id": secrets.token_urlsafe(18),
        "name": name[:80],
        "email": email,
        "password_salt": salt,
        "password_hash": password_hash,
        "status": "active",
        "created_at": _now(),
        "updated_at": _now(),
        "session_version": 1,
    }
    token, max_age = create_access_token(user)
    try:
        users = _users_collection()
        users.insert_one(user)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from exc
    except (PyMongoError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail="Could not create your account because MongoDB is unavailable. Check MONGODB_URI and Atlas network access.") from exc
    set_session_cookie(response, token, max_age)
    return {"user": safe_user(user)}


@router.post("/login")
def login(payload: SignInRequest, request: Request, response: Response):
    check_request_origin(request)
    email = normalize_email(payload.email)
    try:
        user = _users_collection().find_one({"email": email, "status": "active"})
    except (PyMongoError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail="Authentication storage is unavailable. Check MONGODB_URI and Atlas network access.") from exc
    if not user:
        verify_password(payload.password, "00" * 16, "00" * 64)
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    if not verify_password(payload.password, user.get("password_salt", ""), user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    user_id = user.get("_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="This account is not valid. Contact support.")
    return _issue(response, user)


@router.post("/logout")
def logout(request: Request, response: Response):
    check_request_origin(request)
    try:
        user = get_current_user(request)
        get_db().users.update_one({"_id": user["_id"]}, {"$inc": {"session_version": 1}, "$set": {"updated_at": _now()}})
    except HTTPException as exc:
        # Expired or missing sessions can still be cleared from this browser.
        if exc.status_code != 401:
            clear_session_cookie(response)
            raise
    except (PyMongoError, RuntimeError) as exc:
        clear_session_cookie(response)
        raise HTTPException(status_code=503, detail="The browser session was cleared, but server side revocation could not be confirmed. Check MongoDB Atlas.") from exc
    clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {"user": safe_user(user)}
