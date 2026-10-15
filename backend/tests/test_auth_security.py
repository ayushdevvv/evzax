from datetime import datetime, timezone

import jwt
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.config import settings
from app.security.auth import check_request_origin, create_access_token, hash_password, verify_password


def test_password_hash_matches_and_wrong_password_fails():
    salt, digest = hash_password('a sufficiently long password')
    assert verify_password('a sufficiently long password', salt, digest)
    assert not verify_password('another password', salt, digest)


def test_access_token_contains_required_identity_claims(monkeypatch):
    monkeypatch.setattr(settings, 'jwt_secret_key', 'test-secret-value-that-is-at-least-32-chars')
    monkeypatch.setattr(settings, 'jwt_issuer', 'evzax-tests')
    user = {'_id': 'user-123', 'email': 'person@example.com', 'name': 'Person'}
    token, max_age = create_access_token(user)
    claims = jwt.decode(token, settings.jwt_secret_key, algorithms=['HS256'], issuer='evzax-tests')
    assert claims['sub'] == 'user-123'
    assert claims['email'] == 'person@example.com'
    assert claims['name'] == 'Person'
    assert claims['sv'] == 1
    assert max_age > 0
    assert claims['exp'] > claims['iat']


def _request_with_origin(origin: str) -> Request:
    return Request({
        'type': 'http',
        'asgi': {'version': '3.0'},
        'http_version': '1.1',
        'method': 'POST',
        'scheme': 'http',
        'path': '/api/auth/login',
        'raw_path': b'/api/auth/login',
        'query_string': b'',
        'headers': [(b'origin', origin.encode())],
        'server': ('localhost', 8000),
        'client': ('localhost', 5000),
    })


def test_origin_guard_allows_configured_origin(monkeypatch):
    monkeypatch.setattr(settings, 'frontend_origin', 'http://localhost:5173')
    check_request_origin(_request_with_origin('http://localhost:5173'))


def test_origin_guard_rejects_untrusted_origin(monkeypatch):
    monkeypatch.setattr(settings, 'frontend_origin', 'http://localhost:5173')
    with pytest.raises(HTTPException) as error:
        check_request_origin(_request_with_origin('https://malicious.example'))
    assert error.value.status_code == 403


def test_session_cookie_is_http_only_and_configurable(monkeypatch):
    from starlette.responses import Response
    from app.security.auth import set_session_cookie

    monkeypatch.setattr(settings, 'auth_cookie_name', 'evzax_session')
    monkeypatch.setattr(settings, 'auth_cookie_secure', False)
    monkeypatch.setattr(settings, 'auth_cookie_samesite', 'lax')
    response = Response()
    set_session_cookie(response, 'signed-token', 3600)
    header = response.headers['set-cookie'].lower()
    assert 'evzax_session=signed-token' in header
    assert 'httponly' in header
    assert 'samesite=lax' in header
    assert 'max-age=3600' in header


def test_samesite_none_forces_secure_cookie(monkeypatch):
    from starlette.responses import Response
    from app.security.auth import set_session_cookie

    monkeypatch.setattr(settings, 'auth_cookie_name', 'evzax_session')
    monkeypatch.setattr(settings, 'auth_cookie_secure', False)
    monkeypatch.setattr(settings, 'auth_cookie_samesite', 'none')
    response = Response()
    set_session_cookie(response, 'signed-token', 3600)
    assert 'secure' in response.headers['set-cookie'].lower()
