from functools import lru_cache
import re
from pymongo import ASCENDING, TEXT
from pymongo.errors import OperationFailure
from pinecone import Pinecone

from app.core.config import settings
from app.core.errors import integration_error
from app.db.mongo import get_db
from app.services.search_ranking import reciprocal_rank_fusion


@lru_cache(maxsize=1)
def get_index():
    if not settings.pinecone_api_key:
        raise integration_error("Pinecone")
    if not settings.pinecone_index_name:
        raise integration_error("Pinecone index name")
    try:
        client = Pinecone(api_key=settings.pinecone_api_key)
        return client.Index(settings.pinecone_index_name)
    except Exception as exc:
        raise integration_error("Pinecone", str(exc)[:240]) from exc


def namespace_for(repo_id: str, version_id: str) -> str:
    return f"{repo_id}_{version_id}".replace("-", "_")


def documents_namespace(repo_id: str) -> str:
    return f"{repo_id}_reference_docs".replace("-", "_")


def _ensure_mongo_indexes() -> None:
    chunks = get_db().repo_chunks
    chunks.create_index([("repo_id", ASCENDING), ("version_id", ASCENDING), ("source_kind", ASCENDING)])
    chunks.create_index([("repo_id", ASCENDING), ("source_kind", ASCENDING)])
    # Migrate the earlier index definition if it used the `language` metadata field
    # as MongoDB's language override. Values such as "javascript" are not valid
    # MongoDB text-search languages and cause every upsert/search to fail.
    try:
        for index_name, index_info in chunks.index_information().items():
            keys = index_info.get("key", [])
            is_text_index = any(key == "_fts" or kind == "text" for key, kind in keys)
            if is_text_index and index_info.get("language_override", "language") != "textSearchLanguage":
                chunks.drop_index(index_name)
    except OperationFailure:
        # A concurrent worker may be creating or dropping the same index.
        pass
    try:
        chunks.create_index(
            [("content", TEXT), ("file_path", TEXT), ("symbol", TEXT), ("document_name", TEXT)],
            name="gitcontext_chunks_text",
            weights={"content": 5, "symbol": 6, "file_path": 4, "document_name": 3},
            default_language="english",
            # `language` is our programming-language metadata (e.g. javascript, python).
            # Never use it as MongoDB's text-index language override field.
            language_override="textSearchLanguage",
        )
    except OperationFailure as exc:
        # MongoDB permits only one text index per collection. Existing compatible indexes remain usable.
        if "text index" not in str(exc).lower() and "index already exists" not in str(exc).lower():
            raise


def upsert_chunks(repo_id: str, version_id: str, chunks: list[dict], vectors: list[list[float]], namespace: str | None = None) -> int:
    if len(chunks) != len(vectors):
        raise ValueError("Each code chunk must have one embedding.")
    if not chunks:
        return 0
    index = get_index()
    target_namespace = namespace or namespace_for(repo_id, version_id)
    _ensure_mongo_indexes()
    db = get_db()
    for offset in range(0, len(chunks), 80):
        batch_chunks = chunks[offset:offset + 80]
        batch_vectors = vectors[offset:offset + 80]
        records = []
        mongo_records = []
        for chunk, vector in zip(batch_chunks, batch_vectors):
            source_kind = chunk.get("source_kind", "code")
            content = str(chunk.get("content", ""))[:12000]
            metadata = {
                "repo_id": repo_id,
                "version_id": version_id,
                "source_kind": source_kind,
                "file_path": chunk.get("file_path", "unknown"),
                "line_start": int(chunk.get("line_start", 1)),
                "line_end": int(chunk.get("line_end", 1)),
                "language": chunk.get("language", "text"),
                "symbol": chunk.get("symbol") or "",
                "code": content[:8500],
                "document_name": chunk.get("document_name", ""),
                "document_id": chunk.get("document_id", ""),
                "page_number": int(chunk.get("page_number", 0) or 0),
                "indexed_revision_number": int(chunk.get("indexed_revision_number", 0) or 0),
            }
            # Pinecone metadata is deliberately scalar only.
            records.append({"id": chunk["vector_id"], "values": vector, "metadata": metadata})
            mongo_records.append({
                "_id": chunk["vector_id"],
                **metadata,
                "content": content,
                "chunk_id": chunk.get("chunk_id", chunk["vector_id"]),
            })
        try:
            index.upsert(vectors=records, namespace=target_namespace)
            from pymongo import ReplaceOne
            db.repo_chunks.bulk_write([ReplaceOne({"_id": row["_id"]}, row, upsert=True) for row in mongo_records], ordered=False)
        except Exception as exc:
            raise integration_error("Vector or keyword index upsert", str(exc)[:260]) from exc
    return len(chunks)


def _query_namespace(namespace: str, vector: list[float], top_k: int = 8, metadata_filter: dict | None = None) -> list[dict]:
    try:
        query_args = {
            "vector": vector, "namespace": namespace, "top_k": top_k,
            "include_metadata": True, "include_values": False,
        }
        if metadata_filter:
            query_args["filter"] = metadata_filter
        response = get_index().query(**query_args)
    except Exception as exc:
        raise integration_error("Pinecone search", str(exc)[:260]) from exc
    matches = response.get("matches", []) if isinstance(response, dict) else getattr(response, "matches", [])
    results = []
    for match in matches:
        metadata = match.get("metadata", {}) if isinstance(match, dict) else getattr(match, "metadata", {}) or {}
        score = match.get("score") if isinstance(match, dict) else getattr(match, "score", None)
        result = {**metadata, "score": score, "id": match.get("id") if isinstance(match, dict) else getattr(match, "id", "")}
        result["content"] = result.get("code", result.get("content", ""))
        result["search_methods"] = ["semantic"]
        results.append(result)
    return results


def query_chunks(repo_id: str, version_id: str, vector: list[float], top_k: int = 8) -> list[dict]:
    return _query_namespace(namespace_for(repo_id, version_id), vector, top_k)


def query_document_chunks(repo_id: str, vector: list[float], top_k: int = 5, max_revision_number: int | None = None) -> list[dict]:
    metadata_filter = {"indexed_revision_number": {"$lte": max_revision_number}} if max_revision_number is not None else None
    return _query_namespace(documents_namespace(repo_id), vector, top_k, metadata_filter)


def _keyword_query(repo_id: str, query: str, source_kind: str, version_id: str | None, top_k: int, max_revision_number: int | None = None) -> list[dict]:
    terms = re.findall(r"[A-Za-z0-9_.$/\\-]{2,}", query.lower())
    terms = list(dict.fromkeys(terms))[:16]
    if not terms:
        return []
    filters: dict = {"repo_id": repo_id, "source_kind": source_kind}
    if source_kind == "code" and version_id:
        filters["version_id"] = version_id
    if source_kind == "document" and max_revision_number is not None:
        filters["indexed_revision_number"] = {"$lte": max_revision_number}
    collection = get_db().repo_chunks
    try:
        result = list(collection.find(
            {**filters, "$text": {"$search": " ".join(terms)}},
            {"_id": 1, "repo_id": 1, "version_id": 1, "source_kind": 1, "content": 1, "code": 1,
             "file_path": 1, "line_start": 1, "line_end": 1, "language": 1, "symbol": 1,
             "document_name": 1, "document_id": 1, "page_number": 1, "indexed_revision_number": 1,
             "score": {"$meta": "textScore"}},
        ).sort([("score", {"$meta": "textScore"})]).limit(top_k))
        output = []
        for item in result:
            item.pop("_id", None)
            item["content"] = item.get("content") or item.get("code", "")
            item["score"] = float(item.get("score", 0) or 0)
            item["search_methods"] = ["keyword"]
            output.append(item)
        if output:
            return output
    except Exception:
        # Keyword search still has a bounded fallback if a deployment has not created the text index yet.
        pass

    regex_terms = [re.compile(re.escape(term), re.IGNORECASE) for term in terms if len(term) >= 3]
    if not regex_terms:
        return []
    query_filter = {**filters, "$or": [{field: {"$regex": pattern}} for pattern in regex_terms for field in ("content", "file_path", "symbol", "document_name")]}
    try:
        candidates = list(collection.find(query_filter, {"content": 1, "code": 1, "file_path": 1, "line_start": 1, "line_end": 1, "language": 1, "symbol": 1, "document_name": 1, "document_id": 1, "page_number": 1, "version_id": 1}).limit(400))
    except Exception:
        return []
    scored = []
    for item in candidates:
        haystack = " ".join(str(item.get(key, "")) for key in ("content", "file_path", "symbol", "document_name")).lower()
        score = sum(1 for term in terms if term in haystack)
        if score:
            item.pop("_id", None)
            item["content"] = item.get("content") or item.get("code", "")
            item["score"] = score
            item["search_methods"] = ["keyword"]
            scored.append(item)
    return sorted(scored, key=lambda row: row["score"], reverse=True)[:top_k]


def hybrid_query_chunks(repo_id: str, version_id: str, vector: list[float], query: str, top_k: int = 8) -> list[dict]:
    semantic = query_chunks(repo_id, version_id, vector, top_k=max(top_k, 10))
    keyword = _keyword_query(repo_id, query, "code", version_id, max(top_k, 10))
    return reciprocal_rank_fusion(semantic, keyword, top_k)


def hybrid_query_documents(repo_id: str, vector: list[float], query: str, top_k: int = 4, max_revision_number: int | None = None) -> list[dict]:
    semantic = query_document_chunks(repo_id, vector, top_k=max(top_k, 6), max_revision_number=max_revision_number)
    keyword = _keyword_query(repo_id, query, "document", None, max(top_k, 6), max_revision_number=max_revision_number)
    return reciprocal_rank_fusion(semantic, keyword, top_k)


def delete_document_vectors(repo_id: str, vector_ids: list[str]) -> None:
    if not vector_ids:
        return
    try:
        get_index().delete(ids=vector_ids, namespace=documents_namespace(repo_id))
    except Exception as exc:
        raise integration_error("Document vector removal", str(exc)[:240]) from exc


def delete_version_vectors(repo_id: str, version_id: str) -> None:
    try:
        get_index().delete(delete_all=True, namespace=namespace_for(repo_id, version_id))
    except Exception:
        return
