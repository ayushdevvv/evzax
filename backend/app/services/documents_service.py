import hashlib
import io
import re
import uuid
from datetime import datetime, timezone
from pathlib import PurePosixPath

from bson import ObjectId
from fastapi import HTTPException, UploadFile
from gridfs import GridFSBucket
from pypdf import PdfReader
from docx import Document as DocxDocument

from app.core.config import settings
from app.db.mongo import get_db
from app.services.code_parser import redact_secret_lines
from app.services.embedding_service import embed_texts
from app.services.repository_service import get_repository, utc_now
from app.services.vector_service import delete_document_vectors, documents_namespace, upsert_chunks

ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".md", ".mdx", ".txt", ".rst", ".docx", ".csv", ".json", ".yaml", ".yml", ".html", ".log"}


def _safe_filename(name: str) -> str:
    name = PurePosixPath((name or "reference.txt").replace("\\", "/")).name
    name = re.sub(r"[^A-Za-z0-9._ ()]+", "_", name).strip(" .")
    return (name or "reference.txt")[:160]


def _extract(content: bytes, filename: str) -> tuple[list[dict], str]:
    extension = PurePosixPath(filename).suffix.lower()
    if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Upload a PDF, DOCX, Markdown, text, CSV, JSON, YAML, HTML, or log file.")
    pages: list[dict] = []
    if extension == ".pdf":
        try:
            reader = PdfReader(io.BytesIO(content), strict=False)
            if len(reader.pages) > settings.max_document_pages:
                raise HTTPException(status_code=413, detail=f"PDF exceeds the {settings.max_document_pages} page limit.")
            for index, page in enumerate(reader.pages, start=1):
                text = (page.extract_text() or "").strip()
                if text:
                    pages.append({"page_number": index, "text": text})
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not read this PDF. It may be damaged or encrypted. {str(exc)[:140]}") from exc
    elif extension == ".docx":
        try:
            document = DocxDocument(io.BytesIO(content))
            parts = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
            for table in document.tables:
                for row in table.rows:
                    parts.append(" | ".join(cell.text.replace("\n", " ").strip() for cell in row.cells))
            text = "\n".join(parts)
            if text.strip():
                pages.append({"page_number": 0, "text": text})
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Could not read this Word document.") from exc
    else:
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = content.decode("latin-1", errors="replace")
        if text.strip():
            pages.append({"page_number": 0, "text": text})
    if not pages:
        raise HTTPException(status_code=422, detail="No readable text was found. Scanned PDFs need OCR, which is not enabled in this version.")
    # Redact likely credentials before content enters storage, embeddings, or the language model.
    for page in pages:
        page["text"] = redact_secret_lines(page["text"])
    return pages, extension


def _chunk_page(filename: str, page_number: int, text: str, source_kind: str, document_id: str) -> list[dict]:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").splitlines()
    chunks: list[dict] = []
    start = 0
    ordinal = 0
    while start < len(lines):
        end = start
        char_count = 0
        while end < len(lines) and end - start < 64:
            next_count = len(lines[end]) + 1
            if end > start and char_count + next_count > 1800:
                break
            char_count += next_count
            end += 1
        content = "\n".join(lines[start:end]).strip()
        if content:
            identity = hashlib.sha256(f"{document_id}:{page_number}:{ordinal}:{content}".encode("utf-8", errors="replace")).hexdigest()[:24]
            chunks.append({
                "chunk_id": f"{document_id}:{page_number}:{start + 1}:{end}",
                "vector_id": f"doc_{document_id}_{identity}",
                "file_path": filename,
                "line_start": start + 1,
                "line_end": max(start + 1, end),
                "language": PurePosixPath(filename).suffix.lstrip(".").lower() or "text",
                "symbol": None,
                "content": content[:12000],
                "source_kind": source_kind,
                "document_id": document_id,
                "document_name": filename,
                "page_number": page_number,
            })
            ordinal += 1
        if end >= len(lines):
            break
        start = max(end - 8, start + 1)
    return chunks


async def upload_reference_document(repo_id: str, upload: UploadFile) -> dict:
    repo = get_repository(repo_id)
    if not repo.get("current_version_id"):
        raise HTTPException(status_code=409, detail="Index a codebase before adding its reference documents.")
    filename = _safe_filename(upload.filename or "reference.txt")
    max_bytes = settings.max_document_mb * 1024 * 1024
    raw = await upload.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Document exceeds the {settings.max_document_mb} MB upload limit.")
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded document is empty.")
    pages, extension = _extract(raw, filename)
    db = get_db()
    indexed_revision_id = repo.get("latest_version_id") or repo.get("current_version_id")
    current_version = db.repo_versions.find_one({"_id": indexed_revision_id, "repo_id": repo_id, "status": "ready"})
    if not current_version:
        raise HTTPException(status_code=409, detail="There is no ready code revision available for document indexing.")
    revision_number = int(current_version.get("version_number", 1))
    document_id = str(uuid.uuid4())
    chunks: list[dict] = []
    for page in pages:
        page_chunks = _chunk_page(filename, int(page["page_number"] or 0), page["text"], "document", document_id)
        for chunk in page_chunks:
            chunk["indexed_revision_number"] = revision_number
        chunks.extend(page_chunks)
    if not chunks:
        raise HTTPException(status_code=422, detail="No searchable passages were produced from this document.")
    if len(chunks) > settings.max_document_chunks:
        chunks = chunks[:settings.max_document_chunks]
    file_hash = hashlib.sha256(raw).hexdigest()
    duplicate = db.repo_documents.find_one({"repo_id": repo_id, "sha256": file_hash, "status": "ready"})
    if duplicate:
        duplicate["id"] = str(duplicate.pop("_id"))
        duplicate.pop("gridfs_id", None)
        duplicate.pop("vector_ids", None)
        return {"document": duplicate, "duplicate": True}

    grid_id = None
    vector_ids = [chunk["vector_id"] for chunk in chunks]
    try:
        grid_id = GridFSBucket(db, bucket_name="reference_files").upload_from_stream(
            filename, io.BytesIO(raw), metadata={"repo_id": repo_id, "document_id": document_id, "content_type": upload.content_type or "application/octet-stream"}
        )
        texts = [f"Reference document: {filename}\nPage: {chunk['page_number'] or 'not paginated'}\nLines: {chunk['line_start']} to {chunk['line_end']}\n\n{chunk['content']}" for chunk in chunks]
        vectors = embed_texts(texts)
        upsert_chunks(repo_id, indexed_revision_id or "reference-documents", chunks, vectors, namespace=documents_namespace(repo_id))
        now = utc_now()
        record = {
            "_id": document_id,
            "repo_id": repo_id,
            "filename": filename,
            "extension": extension,
            "content_type": upload.content_type or "application/octet-stream",
            "size_bytes": len(raw),
            "page_count": len(pages) if extension == ".pdf" else None,
            "chunk_count": len(chunks),
            "sha256": file_hash,
            "gridfs_id": str(grid_id),
            "vector_ids": [chunk["vector_id"] for chunk in chunks],
            "indexed_revision_id": indexed_revision_id,
            "indexed_revision_number": revision_number,
            "status": "ready",
            "created_at": now,
        }
        db.repo_documents.insert_one(record)
        result = dict(record)
        result["id"] = result.pop("_id")
        result.pop("gridfs_id", None)
        result.pop("vector_ids", None)
        result.pop("sha256", None)
        return {"document": result, "duplicate": False}
    except HTTPException:
        try:
            delete_document_vectors(repo_id, vector_ids)
            db.repo_chunks.delete_many({"_id": {"$in": vector_ids}, "repo_id": repo_id, "source_kind": "document"})
        except Exception:
            pass
        if grid_id:
            try:
                GridFSBucket(db, bucket_name="reference_files").delete(grid_id)
            except Exception:
                pass
        raise
    except Exception:
        try:
            delete_document_vectors(repo_id, vector_ids)
            db.repo_chunks.delete_many({"_id": {"$in": vector_ids}, "repo_id": repo_id, "source_kind": "document"})
        except Exception:
            pass
        if grid_id:
            try:
                GridFSBucket(db, bucket_name="reference_files").delete(grid_id)
            except Exception:
                pass
        raise


def list_reference_documents(repo_id: str) -> list[dict]:
    get_repository(repo_id)
    items = list(get_db().repo_documents.find({"repo_id": repo_id, "status": "ready"}).sort("created_at", -1).limit(100))
    result = []
    for item in items:
        item["id"] = str(item.pop("_id"))
        for private_key in ("gridfs_id", "vector_ids", "sha256"):
            item.pop(private_key, None)
        result.append(item)
    return result


def delete_reference_document(repo_id: str, document_id: str) -> dict:
    db = get_db()
    get_repository(repo_id)
    record = db.repo_documents.find_one({"_id": document_id, "repo_id": repo_id})
    if not record:
        raise HTTPException(status_code=404, detail="Reference document was not found.")
    vector_ids = record.get("vector_ids", [])
    delete_document_vectors(repo_id, vector_ids)
    db.repo_chunks.delete_many({"_id": {"$in": vector_ids}, "repo_id": repo_id, "source_kind": "document"})
    if record.get("gridfs_id"):
        try:
            GridFSBucket(db, bucket_name="reference_files").delete(ObjectId(record["gridfs_id"]))
        except Exception:
            pass
    db.repo_documents.delete_one({"_id": document_id, "repo_id": repo_id})
    return {"deleted": True, "id": document_id}


def download_reference_document(repo_id: str, document_id: str) -> tuple[bytes, str, str]:
    db = get_db()
    get_repository(repo_id)
    record = db.repo_documents.find_one({"_id": document_id, "repo_id": repo_id})
    if not record or not record.get("gridfs_id"):
        raise HTTPException(status_code=404, detail="Reference document was not found.")
    try:
        stream = GridFSBucket(db, bucket_name="reference_files").open_download_stream(ObjectId(record["gridfs_id"]))
        content = stream.read()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="The stored file could not be downloaded from MongoDB Atlas.") from exc
    return content, record["filename"], record.get("content_type", "application/octet-stream")
