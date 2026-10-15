import time

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

from app.core.auth import authenticate_account, create_account, optional_user, revoke_session, start_session
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupPayload(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class LoginPayload(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


def _set_session_cookie(response: Response, token: str, max_age: int) -> None:
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        path="/",
    )


def _no_store(response: Response) -> None:
    # Session state must never be served from a browser or CDN cache.
    response.headers["Cache-Control"] = "no-store"
    response.headers["Vary"] = "Cookie"


def _start(user: dict, response: Response) -> dict:
    token, _, expiry = start_session(user)
    max_age = max(1, int(expiry.timestamp() - time.time()))
    _set_session_cookie(response, token, max_age)
    _no_store(response)
    return {"user": user}


@router.get("/me")
def auth_me(request: Request, response: Response):
    _no_store(response)
    return {"user": optional_user(request)}


@router.post("/signup")
def signup(payload: SignupPayload, response: Response):
    try:
        user = create_account(payload.name, payload.email, payload.password)
        return _start(user, response)
    except HTTPException:
        raise
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Your account could not be created right now. Please try again.") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Your account could not be created right now. Please try again.") from exc


@router.post("/login")
def login(payload: LoginPayload, request: Request, response: Response):
    try:
        user = authenticate_account(payload.email, payload.password, request)
        return _start(user, response)
    except HTTPException:
        raise
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Sign in is temporarily unavailable. Please try again.") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Sign in is temporarily unavailable. Please try again.") from exc


@router.post("/logout")
def logout(request: Request, response: Response):
    # Idempotent on purpose: signing out with an expired or already-revoked session must
    # still clear the cookie and succeed, otherwise the UI is stuck "signed in".
    _no_store(response)
    revoke_session(request.cookies.get(settings.auth_cookie_name))
    response.delete_cookie(
        key=settings.auth_cookie_name,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )
    return {"ok": True}
