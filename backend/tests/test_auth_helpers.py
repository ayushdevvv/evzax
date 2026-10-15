from types import SimpleNamespace

from app.core.auth import _request_ip
from app.core.config import Settings, settings


def _request(forwarded=None, host="10.0.0.1"):
    return SimpleNamespace(headers={"x-forwarded-for": forwarded} if forwarded else {}, client=SimpleNamespace(host=host))


def test_forwarded_header_ignored_unless_proxy_is_trusted(monkeypatch):
    monkeypatch.setattr(settings, "auth_trust_proxy", False)
    assert _request_ip(_request("1.1.1.1, 2.2.2.2")) == "10.0.0.1"


def test_trusted_proxy_uses_last_hop_so_client_forged_prefix_is_ignored(monkeypatch):
    monkeypatch.setattr(settings, "auth_trust_proxy", True)
    assert _request_ip(_request("9.9.9.9, 2.2.2.2")) == "2.2.2.2"
    assert _request_ip(_request()) == "10.0.0.1"


def test_samesite_none_forces_secure_cookie():
    cfg = Settings(_env_file=None, auth_cookie_samesite="None", auth_cookie_secure=False)
    assert cfg.auth_cookie_samesite == "none" and cfg.auth_cookie_secure is True


def test_unknown_samesite_falls_back_to_lax():
    assert Settings(_env_file=None, auth_cookie_samesite="bogus").auth_cookie_samesite == "lax"
