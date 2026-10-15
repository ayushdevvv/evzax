import hashlib
from concurrent.futures import ThreadPoolExecutor
import difflib
import io
import re
import tempfile
import time
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import PurePosixPath
from urllib.parse import quote, urlparse

import httpx
from fastapi import HTTPException, UploadFile, status
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.db.mongo import get_db
from app.services.code_parser import (
    CodeFile,
    chunk_code,
    language_for_path,
    parse_python_symbols,
    redact_secret_lines,
    should_skip_path,
)
from app.services.embedding_service import embed_texts
from app.services.vector_service import delete_version_vectors, upsert_chunks


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()


def safe_repo_name(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._ ]+", "", name).strip(" .")
    return (name or "Codebase")[:100]


def _github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "EVZAX-Codebase-Index",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def parse_github_url(repo_url: str) -> tuple[str, str]:
    # Accept a bare host/path as well as a full URL. Requests are rebuilt from
    # validated owner/repository parts, so arbitrary hosts are never fetched.
    raw = (repo_url or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Enter a public GitHub repository URL.")
    if raw.startswith("//"):
        raw = "https:" + raw
    elif not re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", raw):
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in {"https", "http"} or parsed.hostname not in {"github.com", "www.github.com"}:
        raise HTTPException(status_code=400, detail="Enter a public GitHub repository URL.")
    segments = [part for part in parsed.path.strip("/").split("/") if part]
    if len(segments) < 2:
        raise HTTPException(status_code=400, detail="The URL must include an owner and repository name.")
    owner, repo = segments[0], segments[1]
    repo = repo.removesuffix(".git")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repo):
        raise HTTPException(status_code=400, detail="That GitHub URL does not look valid.")
    return owner, repo


def _raise_for_github(response: httpx.Response) -> None:
    """Translate GitHub failures into safe, specific API errors."""
    if response.status_code == 429 or (response.status_code == 403 and response.headers.get("x-ratelimit-remaining") == "0"):
        wait = ""
        try:
            minutes = max(1, round((int(response.headers.get("x-ratelimit-reset", "0")) - time.time()) / 60))
            if minutes < 24 * 60:
                wait = f" Try again in about {minutes} minute{'s' if minutes != 1 else ''}."
        except ValueError:
            pass
        raise HTTPException(status_code=429, detail="GitHub rate limit reached." + wait + (" Set GITHUB_TOKEN on the server for a much higher limit." if not settings.github_token else ""))
    if response.status_code == 403:
        raise HTTPException(status_code=403, detail="GitHub refused access to this repository.")
    response.raise_for_status()


def _decode_source(path: str, raw: bytes) -> CodeFile | None:
    if not raw or b"\x00" in raw or len(raw) > settings.max_file_bytes:
        return None
    decoded = raw.decode("utf-8", errors="replace")
    return CodeFile(path=path, content=decoded, language=language_for_path(path)) if decoded.strip() else None


def _read_archive(fileobj, candidates: list[tuple[str, int]]) -> list[CodeFile]:
    """Read only the wanted paths from a GitHub archive. Nothing is extracted to disk."""
    files: list[CodeFile] = []
    total = 0
    budget = settings.max_repository_mb * 1024 * 1024
    with zipfile.ZipFile(fileobj) as archive:
        index = {}
        for info in archive.infolist():
            if info.is_dir():
                continue
            parts = info.filename.split("/", 1)  # first segment is the owner-repo-sha wrapper
            if len(parts) == 2:
                index[parts[1]] = info
        for path, _size in candidates:
            info = index.get(path)
            if info is None or info.file_size > settings.max_file_bytes:
                continue
            raw = archive.read(info)
            total += len(raw)
            if total > budget:
                break
            code_file = _decode_source(path, raw)
            if code_file:
                files.append(code_file)
    return files


def _files_from_archive(client: httpx.Client, base: str, commit_sha: str, headers: dict[str, str], candidates: list[tuple[str, int]]) -> list[CodeFile] | None:
    """One archive download instead of one request per file: faster, and it spends a single
    API call of the rate limit. Returns None so the caller can fall back to per-file fetching."""
    limit = settings.max_archive_mb * 1024 * 1024
    try:
        with tempfile.SpooledTemporaryFile(max_size=32 * 1024 * 1024) as buffer:
            with client.stream("GET", f"{base}/zipball/{commit_sha}", headers=headers, timeout=httpx.Timeout(120.0, connect=15.0)) as response:
                if response.status_code != 200:
                    return None
                if int(response.headers.get("content-length") or 0) > limit:
                    return None
                size = 0
                for part in response.iter_bytes(256 * 1024):
                    size += len(part)
                    if size > limit:
                        return None
                    buffer.write(part)
            buffer.seek(0)
            return _read_archive(buffer, candidates) or None
    except (httpx.HTTPError, zipfile.BadZipFile, OSError, ValueError):
        return None


def _files_from_raw(client: httpx.Client, raw_base: str, candidates: list[tuple[str, int]]) -> list[CodeFile]:
    """Fallback for repositories too large for the archive path: bounded parallel raw fetches."""
    files: list[CodeFile] = []
    total = 0
    budget = settings.max_repository_mb * 1024 * 1024
    workers = max(1, settings.github_fetch_workers)

    def fetch_one(item):
        path, _expected_size = item
        for attempt in range(3):
            try:
                response = client.get(f"{raw_base}/{quote(path, safe='/')}", headers={"User-Agent": "EVZAX-Codebase-Index"})
                if response.status_code not in {429, 500, 502, 503, 504}:
                    return path, response.content if response.status_code == 200 else b""
            except httpx.HTTPError:
                pass
            if attempt < 2:
                time.sleep(0.25 * (2 ** attempt))
        return path, b""

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for offset in range(0, len(candidates), workers):
            for path, body in pool.map(fetch_one, candidates[offset:offset + workers]):
                total += len(body)
                if total > budget:
                    return files
                code_file = _decode_source(path, body)
                if code_file:
                    files.append(code_file)
    return files


def fetch_github_snapshot(repo_url: str, ref: str | None = None) -> dict:
    owner, repo_name = parse_github_url(repo_url)
    base = f"https://api.github.com/repos/{owner}/{repo_name}"
    headers = _github_headers()
    try:
        with httpx.Client(timeout=httpx.Timeout(40.0, connect=15.0), follow_redirects=True) as client:
            def get_with_retry(url: str, request_headers: dict[str, str] | None = None):
                last_error = None
                response = None
                for attempt in range(4):
                    try:
                        response = client.get(url, headers=request_headers or headers)
                        if response.status_code not in {429, 500, 502, 503, 504} or response.headers.get("x-ratelimit-remaining") == "0":
                            return response
                    except httpx.HTTPError as exc:
                        last_error = exc
                    if attempt < 3:
                        time.sleep(0.35 * (2 ** attempt))
                if last_error:
                    raise last_error
                return response

            repo_response = get_with_retry(base, headers)
            if repo_response.status_code == 404:
                raise HTTPException(status_code=404, detail="Repository not found or not publicly accessible.")
            _raise_for_github(repo_response)
            repo_info = repo_response.json()
            branch = ref or repo_info.get("default_branch") or "main"
            commit_response = get_with_retry(f"{base}/commits/{quote(branch, safe='')}", headers)
            if commit_response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Could not find branch or revision '{branch}'.")
            _raise_for_github(commit_response)
            commit_info = commit_response.json()
            commit_sha = commit_info["sha"]
            tree_response = get_with_retry(f"{base}/git/trees/{commit_sha}?recursive=1", headers)
            _raise_for_github(tree_response)
            tree = tree_response.json()
            if tree.get("truncated"):
                raise HTTPException(status_code=413, detail="This repository is too large for one index pass. Try a smaller branch or repository.")

            candidates = []
            for item in tree.get("tree", []):
                if item.get("type") != "blob":
                    continue
                path = item.get("path", "")
                if should_skip_path(path):
                    continue
                if int(item.get("size", 0) or 0) > settings.max_file_bytes:
                    continue
                candidates.append((path, int(item.get("size", 0) or 0)))

            # Spend the indexing budget on useful application source first.
            def candidate_score(candidate):
                path, size = candidate
                lower = path.lower()
                score = 0
                if any(part in lower.split("/") for part in ("src", "app", "lib", "packages", "backend", "frontend")):
                    score += 30
                if lower.endswith((".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".cs", ".cpp", ".h", ".vue", ".svelte")):
                    score += 20
                if any(part in lower for part in ("test", "fixture", "mock", "example", "generated", "dist/", "build/")):
                    score -= 15
                score -= min(size / 100_000, 8)
                return (-score, path)

            candidates.sort(key=candidate_score)
            candidates = candidates[:settings.max_repository_files]

            files = _files_from_archive(client, base, commit_sha, headers, candidates)
            if files is None:
                files = _files_from_raw(client, f"https://raw.githubusercontent.com/{owner}/{repo_name}/{commit_sha}", candidates)
    except HTTPException:
        raise
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="GitHub could not be read right now. Please try again shortly.") from exc

    if not files:
        raise HTTPException(status_code=422, detail="No supported source files were found. Check the repository language and exclusions.")
    return {
        "name": safe_repo_name(repo_info.get("name") or repo_name),
        "source_type": "github",
        "source_url": repo_info.get("html_url") or f"https://github.com/{owner}/{repo_name}",
        "default_branch": branch,
        "commit_sha": commit_sha,
        "revision_label": commit_sha[:10],
        "files": files,
    }


async def read_zip_snapshot(upload: UploadFile, display_name: str | None = None) -> dict:
    filename = upload.filename or "codebase.zip"
    if not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Upload a ZIP archive of your project.")
    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await upload.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"ZIP exceeds the {settings.max_upload_mb} MB upload limit.")
    if not content:
        raise HTTPException(status_code=400, detail="The ZIP file is empty.")

    files: list[CodeFile] = []
    expanded_bytes = 0
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            members = [info for info in archive.infolist() if not info.is_dir()]
            if len(members) > settings.max_repository_files * 3:
                raise HTTPException(status_code=413, detail="The archive contains too many entries.")
            for info in members:
                raw_path = info.filename.replace("\\", "/")
                path = PurePosixPath(raw_path)
                if path.is_absolute() or ".." in path.parts or not path.parts:
                    continue
                normalized = str(path)
                # Many source archives contain one wrapping root directory. Strip it only when it is uniform.
                if len(path.parts) > 1 and path.parts[0].endswith("-main") and path.parts[0].lower() not in {"src-main"}:
                    normalized = "/".join(path.parts[1:])
                elif len(path.parts) > 1 and path.parts[0].endswith("-master"):
                    normalized = "/".join(path.parts[1:])
                if should_skip_path(normalized):
                    continue
                if info.file_size > settings.max_file_bytes:
                    continue
                if info.file_size > 0 and info.compress_size == 0:
                    continue
                if info.compress_size > 0 and info.file_size / info.compress_size > 250:
                    continue
                expanded_bytes += info.file_size
                if expanded_bytes > max_bytes * 3:
                    raise HTTPException(status_code=413, detail="Expanded ZIP contents exceed the safe extraction limit.")
                try:
                    raw = archive.read(info)
                except (RuntimeError, zipfile.BadZipFile):
                    continue
                if b"\x00" in raw:
                    continue
                decoded = raw.decode("utf-8", errors="replace")
                if decoded.strip():
                    files.append(CodeFile(path=normalized, content=decoded, language=language_for_path(normalized)))
                if len(files) >= settings.max_repository_files:
                    break
    except HTTPException:
        raise
    except (zipfile.BadZipFile, OSError) as exc:
        raise HTTPException(status_code=400, detail="That ZIP archive could not be opened.") from exc
    if not files:
        raise HTTPException(status_code=422, detail="No supported source files were found in this ZIP.")
    archive_hash = hashlib.sha256(content).hexdigest()
    name = safe_repo_name(display_name or filename[:-4])
    return {
        "name": name,
        "source_type": "zip",
        "source_url": None,
        "default_branch": None,
        "commit_sha": None,
        "revision_label": f"zip {archive_hash[:10]}",
        "files": files,
        "content_hash": archive_hash,
    }


def _serialize_repo(document: dict) -> dict:
    data = dict(document)
    data["id"] = str(data.pop("_id", data.get("id", "")))
    # The full path hash manifest is retained for server side diffs, not sent to the browser.
    data.pop("file_hashes", None)
    data.pop("error", None)
    data.pop("owner_id", None)
    return data


def list_repositories(owner_id: str | None = None) -> list[dict]:
    db = get_db()
    query = {"owner_id": owner_id} if owner_id else {}
    items = list(db.repositories.find(query, {"_id": 1, "name": 1, "source_type": 1, "source_url": 1, "default_branch": 1,
        "current_version_id": 1, "current_revision": 1, "status": 1, "file_count": 1, "chunk_count": 1,
        "created_at": 1, "updated_at": 1}).sort("updated_at", -1).limit(100))
    return [_serialize_repo(item) for item in items]


def get_repository(repo_id: str) -> dict:
    repo = get_db().repositories.find_one({"_id": repo_id})
    if not repo:
        raise HTTPException(status_code=404, detail="Repository was not found.")
    return _serialize_repo(repo)


def list_versions(repo_id: str) -> list[dict]:
    get_repository(repo_id)
    versions = list(get_db().repo_versions.find({"repo_id": repo_id}).sort("version_number", -1))
    return [_serialize_repo(item) for item in versions]


def compare_versions(repo_id: str, from_version_id: str, to_version_id: str) -> dict:
    db = get_db()
    get_repository(repo_id)
    source = db.repo_versions.find_one({"_id": from_version_id, "repo_id": repo_id, "status": "ready"})
    target = db.repo_versions.find_one({"_id": to_version_id, "repo_id": repo_id, "status": "ready"})
    if not source or not target:
        raise HTTPException(status_code=404, detail="Select two ready revisions from this codebase.")
    old_hashes = source.get("file_hashes", {}) or {}
    new_hashes = target.get("file_hashes", {}) or {}
    added = sorted(set(new_hashes) - set(old_hashes))
    removed = sorted(set(old_hashes) - set(new_hashes))
    modified = sorted(path for path in set(old_hashes) & set(new_hashes) if old_hashes[path] != new_hashes[path])
    changes = ([{"path": path, "status": "added"} for path in added]
               + [{"path": path, "status": "modified"} for path in modified]
               + [{"path": path, "status": "removed"} for path in removed])
    for row in changes[:60]:
        path = row["path"]
        old = db.repo_files.find_one({"_id": f"{from_version_id}:{path}"})
        new = db.repo_files.find_one({"_id": f"{to_version_id}:{path}"})
        old_lines = (old or {}).get("content", "").splitlines()
        new_lines = (new or {}).get("content", "").splitlines()
        if row["status"] == "modified" and old and new:
            diff_lines = list(difflib.unified_diff(old_lines, new_lines, fromfile=f"{path} @ {source.get('revision', 'old')}", tofile=f"{path} @ {target.get('revision', 'new')}", lineterm=""))
            row["patch"] = "\n".join(diff_lines[:180])
        elif row["status"] == "added" and new:
            row["patch"] = "\n".join([f"+++ {path}", *[f"+{line}" for line in new_lines[:80]]])
        elif row["status"] == "removed" and old:
            row["patch"] = "\n".join([f"--- {path}", *[f"-{line}" for line in old_lines[:80]]])
        row["old_hash"] = old_hashes.get(path)
        row["new_hash"] = new_hashes.get(path)
    return {
        "repository_id": repo_id,
        "from_version": {"id": from_version_id, "revision": source.get("revision"), "created_at": source.get("created_at")},
        "to_version": {"id": to_version_id, "revision": target.get("revision"), "created_at": target.get("created_at")},
        "summary": {"added": len(added), "modified": len(modified), "removed": len(removed), "total": len(changes)},
        "changes": changes[:60],
        "truncated": len(changes) > 60,
    }


def _create_repo_if_needed(snapshot: dict, existing_repo_id: str | None, owner_id: str | None = None) -> tuple[str, dict]:
    db = get_db()
    now = utc_now()
    if existing_repo_id:
        existing = db.repositories.find_one({"_id": existing_repo_id})
        if not existing or (owner_id and existing.get("owner_id") != owner_id):
            raise HTTPException(status_code=404, detail="Repository to update was not found.")
        return existing_repo_id, existing
    repo_id = str(uuid.uuid4())
    repo = {
        "_id": repo_id,
        "owner_id": owner_id,
        "name": snapshot["name"],
        "source_type": snapshot["source_type"],
        "source_url": snapshot.get("source_url"),
        "default_branch": snapshot.get("default_branch"),
        "current_version_id": None,
        "current_revision": None,
        "latest_version_id": None,
        "latest_revision": None,
        "status": "indexing",
        "file_count": 0,
        "chunk_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    db.repositories.insert_one(repo)
    return repo_id, repo


def index_snapshot(snapshot: dict, existing_repo_id: str | None = None, owner_id: str | None = None) -> dict:
    db = get_db()
    repo_id, repo = _create_repo_if_needed(snapshot, existing_repo_id, owner_id)
    files: list[CodeFile] = snapshot["files"]
    version_id = str(uuid.uuid4())
    previous_version_id = repo.get("latest_version_id") or repo.get("current_version_id")
    current_versions_count = db.repo_versions.count_documents({"repo_id": repo_id})
    version_number = current_versions_count + 1
    now = utc_now()
    chunks = []
    symbol_count = 0
    file_hashes = {code_file.path: sha256_text(code_file.content) for code_file in files}
    previous_version = db.repo_versions.find_one({"_id": previous_version_id}) if previous_version_id else None
    previous_hashes = (previous_version or {}).get("file_hashes", {})
    added_paths = sorted(set(file_hashes) - set(previous_hashes))
    removed_paths = sorted(set(previous_hashes) - set(file_hashes))
    modified_paths = sorted(path for path in set(file_hashes) & set(previous_hashes) if file_hashes[path] != previous_hashes[path])
    if previous_version is None:
        added_paths = sorted(file_hashes)
    diff_files = ([{"path": path, "status": "added"} for path in added_paths]
                  + [{"path": path, "status": "modified"} for path in modified_paths]
                  + [{"path": path, "status": "removed"} for path in removed_paths])
    diff = {
        "added": len(added_paths),
        "modified": len(modified_paths),
        "removed": len(removed_paths),
        "total": len(diff_files),
        "files": diff_files[:150],
        "truncated": len(diff_files) > 150,
    }

    for code_file in files:
        symbols = parse_python_symbols(code_file.path, code_file.content) if code_file.language == "python" else []
        symbol_count += len(symbols)
        parsed_chunks = chunk_code(code_file.path, code_file.content)
        for index, chunk in enumerate(parsed_chunks):
            # For Python chunks, prefer the innermost AST symbol that overlaps the chunk.
            if symbols:
                matching = [symbol for symbol in symbols if symbol["line_start"] <= chunk.line_end and symbol["line_end"] >= chunk.line_start]
                if matching:
                    best = min(matching, key=lambda item: abs(item["line_start"] - chunk.line_start))
                    chunk.symbol = best["symbol"]
            chunks.append({
                "chunk_id": chunk.chunk_id,
                "vector_id": f"{version_id}_{sha256_text(chunk.file_path + chunk.chunk_id)[:24]}",
                "file_path": chunk.file_path,
                "line_start": chunk.line_start,
                "line_end": chunk.line_end,
                "language": chunk.language,
                "symbol": chunk.symbol,
                "content": chunk.content,
            })
            if len(chunks) >= settings.max_code_chunks:
                break
        if len(chunks) >= settings.max_code_chunks:
            break

    if not chunks:
        raise HTTPException(status_code=422, detail="No indexable code chunks were produced.")
    version_doc = {
        "_id": version_id,
        "repo_id": repo_id,
        "version_number": version_number,
        "revision": snapshot.get("revision_label") or f"version {version_number}",
        "commit_sha": snapshot.get("commit_sha"),
        "source_type": snapshot["source_type"],
        "source_url": snapshot.get("source_url") or repo.get("source_url"),
        "default_branch": snapshot.get("default_branch") or repo.get("default_branch"),
        "content_hash": snapshot.get("content_hash"),
        "status": "indexing",
        "is_current": False,
        "file_count": len(files),
        "chunk_count": len(chunks),
        "symbol_count": symbol_count,
        "file_hashes": file_hashes,
        "diff": diff,
        "is_latest": False,
        "created_at": now,
        "indexed_at": None,
        "error": None,
    }
    db.repo_versions.insert_one(version_doc)

    try:
        from pymongo import ReplaceOne
        if files:
            db.repo_files.bulk_write([
                ReplaceOne(
                    {"_id": f"{version_id}:{code_file.path}"},
                    {"_id": f"{version_id}:{code_file.path}", "repo_id": repo_id, "version_id": version_id,
                     "file_path": code_file.path, "language": code_file.language,
                     "content": redact_secret_lines(code_file.content), "sha256": file_hashes[code_file.path]},
                    upsert=True,
                ) for code_file in files
            ], ordered=False)
        texts = [f"File: {c['file_path']}\nLanguage: {c['language']}\nSymbol: {c['symbol'] or 'unknown'}\nLines: {c['line_start']} to {c['line_end']}\n\n{c['content']}" for c in chunks]
        vectors = embed_texts(texts)
        upsert_chunks(repo_id, version_id, chunks, vectors)
        db.repo_versions.update_many({"repo_id": repo_id}, {"$set": {"is_current": False, "is_latest": False}})
        db.repo_versions.update_one({"_id": version_id}, {"$set": {"status": "ready", "is_current": True, "is_latest": True, "indexed_at": utc_now()}})
        db.repositories.update_one({"_id": repo_id}, {"$set": {
            "name": snapshot["name"] or repo["name"],
            "source_type": repo.get("source_type") or snapshot["source_type"],
            "source_url": snapshot.get("source_url") or repo.get("source_url"),
            "default_branch": snapshot.get("default_branch") or repo.get("default_branch"),
            "current_version_id": version_id,
            "current_revision": snapshot.get("commit_sha") or version_doc["revision"],
            "latest_version_id": version_id,
            "latest_revision": snapshot.get("commit_sha") or version_doc["revision"],
            "status": "ready",
            "file_count": len(files),
            "chunk_count": len(chunks),
            "updated_at": utc_now(),
        }})
    except Exception as exc:
        delete_version_vectors(repo_id, version_id)
        db.repo_chunks.delete_many({"repo_id": repo_id, "version_id": version_id, "source_kind": "code"})
        db.repo_files.delete_many({"repo_id": repo_id, "version_id": version_id})
        db.repo_versions.update_one({"_id": version_id}, {"$set": {"status": "failed", "error": str(exc)[:300]}})
        if not repo.get("current_version_id"):
            db.repositories.update_one({"_id": repo_id}, {"$set": {"status": "failed", "updated_at": utc_now()}})
        raise

    refreshed = db.repositories.find_one({"_id": repo_id})
    return {"repository": _serialize_repo(refreshed), "version": _serialize_repo(db.repo_versions.find_one({"_id": version_id}))}


def sync_github_repository(repo_id: str) -> dict:
    repo = get_repository(repo_id)
    if not repo.get("source_url"):
        raise HTTPException(status_code=400, detail="This codebase started as a ZIP upload. Upload a new ZIP to create its next version.")
    snapshot = fetch_github_snapshot(repo["source_url"], repo.get("default_branch"))
    latest_revision = repo.get("latest_revision") or repo.get("current_revision")
    if snapshot.get("commit_sha") and snapshot.get("commit_sha") == latest_revision:
        return {"repository": repo, "version": None, "unchanged": True}
    return index_snapshot(snapshot, existing_repo_id=repo_id, owner_id=repo.get("owner_id"))


def activate_version(repo_id: str, version_id: str) -> dict:
    db = get_db()
    repo = get_repository(repo_id)
    version = db.repo_versions.find_one({"_id": version_id, "repo_id": repo_id, "status": "ready"})
    if not version:
        raise HTTPException(status_code=404, detail="That indexed version is not available.")
    db.repo_versions.update_many({"repo_id": repo_id}, {"$set": {"is_current": False}})
    db.repo_versions.update_one({"_id": version_id}, {"$set": {"is_current": True}})
    db.repositories.update_one({"_id": repo_id}, {"$set": {
        "current_version_id": version_id,
        "current_revision": version.get("commit_sha") or version.get("revision"),
        "file_count": version.get("file_count", 0),
        "chunk_count": version.get("chunk_count", 0),
        "status": "ready",
        "updated_at": utc_now(),
    }})
    return get_repository(repo_id)
