import io
import zipfile

from app.core.config import settings
from app.services.repository_service import _read_archive


def _archive(files: dict[str, bytes | str]) -> io.BytesIO:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, body in files.items():
            archive.writestr(f"owner-repo-abc123/{name}", body)
    buffer.seek(0)
    return buffer


def test_reads_only_wanted_text_files_and_strips_wrapper_dir():
    buffer = _archive({"src/a.py": "print(1)\n", "src/bin.py": b"a\x00b", "empty.py": "  \n", "skipped.py": "x = 1\n"})
    candidates = [("src/a.py", 9), ("src/bin.py", 3), ("empty.py", 3), ("missing.py", 1)]
    assert [f.path for f in _read_archive(buffer, candidates)] == ["src/a.py"]


def test_respects_per_file_and_total_budget(monkeypatch):
    buffer = _archive({"big.py": "x" * 2000, "ok.py": "y = 2\n"})
    monkeypatch.setattr(settings, "max_file_bytes", 1000)
    assert [f.path for f in _read_archive(buffer, [("big.py", 2000), ("ok.py", 6)])] == ["ok.py"]
    buffer.seek(0)
    monkeypatch.setattr(settings, "max_repository_mb", 0)
    assert _read_archive(buffer, [("ok.py", 6)]) == []


def test_commit_sha_read_from_zip_comment():
    from app.services.repository_service import _archive_commit_sha
    sha = "a" * 40
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("owner-repo-HEAD/a.py", "x = 1\n")
        archive.comment = sha.encode()
    buffer.seek(0)
    with zipfile.ZipFile(buffer) as archive:
        assert _archive_commit_sha(archive) == sha


def test_rate_limit_message_is_provider_neutral():
    from app.services.repository_service import _busy_error
    detail = _busy_error(600).detail.lower()
    assert "about 10 minutes" in detail
    assert not any(word in detail for word in ("github", "token", "server", "rate limit"))


def test_connect_budget_blocks_only_at_high_volume(monkeypatch):
    import pytest
    from fastapi import HTTPException
    from app.services import repository_service as rs
    monkeypatch.setattr(rs.settings, "repo_connects_per_hour", 60)
    rs._connect_log.clear()
    for _ in range(60):
        rs.check_connect_budget("user-1")
    with pytest.raises(HTTPException) as caught:
        rs.check_connect_budget("user-1")
    assert caught.value.status_code == 429
    rs.check_connect_budget("user-2")
