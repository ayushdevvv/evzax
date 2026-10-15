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
