from math import ceil
from statistics import mean
from time import perf_counter
from uuid import uuid4

from fastapi import HTTPException

from app.db.mongo import get_db
from app.services.embedding_service import embed_texts
from app.services.repository_service import get_repository, utc_now
from app.services.vector_service import hybrid_query_chunks, query_chunks


def _normalize_path(value: str) -> str:
    return value.strip().replace("\\", "/").lstrip("./").lower()


def _score(hits: list[dict], relevant_paths: list[str], k: int) -> dict:
    relevant = {_normalize_path(path) for path in relevant_paths}
    retrieved = [_normalize_path(str(hit.get("file_path", ""))) for hit in hits[:k]]
    found = [path for path in retrieved if path in relevant]
    first_rank = next((index for index, path in enumerate(retrieved, start=1) if path in relevant), None)
    return {
        "recall_at_k": round(len(set(found)) / max(len(relevant), 1), 4),
        "precision_at_k": round(len(set(found)) / max(len(retrieved), 1), 4),
        "reciprocal_rank": round(1 / first_rank, 4) if first_rank else 0.0,
        "relevant_found": sorted(set(found)),
        "retrieved_paths": [hit.get("file_path", "") for hit in hits[:k]],
    }


def _summary(rows: list[dict], key: str) -> dict:
    latencies = [row[key]["latency_ms"] for row in rows]
    sorted_latencies = sorted(latencies)
    p95 = sorted_latencies[max(0, ceil(0.95 * len(sorted_latencies)) - 1)] if sorted_latencies else 0
    return {
        "recall_at_k": round(mean(row[key]["recall_at_k"] for row in rows), 4) if rows else 0,
        "precision_at_k": round(mean(row[key]["precision_at_k"] for row in rows), 4) if rows else 0,
        "mrr": round(mean(row[key]["reciprocal_rank"] for row in rows), 4) if rows else 0,
        "mean_latency_ms": round(mean(latencies), 2) if latencies else 0,
        "p95_latency_ms": round(p95, 2),
    }


def run_retrieval_evaluation(repo_id: str, version_id: str | None, k: int, cases: list[dict]) -> dict:
    repo = get_repository(repo_id)
    selected_version = version_id or repo.get("current_version_id")
    version = get_db().repo_versions.find_one({"_id": selected_version, "repo_id": repo_id, "status": "ready"}) if selected_version else None
    if not version:
        raise HTTPException(status_code=404, detail="Select a ready code revision before running evaluation.")
    rows = []
    for case in cases:
        question = case["question"].strip()
        relevant_paths = case["relevant_paths"]
        vector = embed_texts([question])[0]
        semantic_start = perf_counter()
        semantic_hits = query_chunks(repo_id, selected_version, vector, top_k=k)
        semantic_ms = (perf_counter() - semantic_start) * 1000
        hybrid_start = perf_counter()
        hybrid_hits = hybrid_query_chunks(repo_id, selected_version, vector, question, top_k=k)
        hybrid_ms = (perf_counter() - hybrid_start) * 1000
        semantic_score = _score(semantic_hits, relevant_paths, k)
        hybrid_score = _score(hybrid_hits, relevant_paths, k)
        semantic_score["latency_ms"] = round(semantic_ms, 2)
        hybrid_score["latency_ms"] = round(hybrid_ms, 2)
        rows.append({"question": question, "relevant_paths": relevant_paths, "semantic": semantic_score, "hybrid": hybrid_score})
    result = {
        "id": str(uuid4()), "repository_id": repo_id, "version_id": selected_version,
        "revision": version.get("revision"), "k": k, "case_count": len(rows),
        "semantic": _summary(rows, "semantic"), "hybrid": _summary(rows, "hybrid"),
        "cases": rows, "created_at": utc_now(),
    }
    get_db().retrieval_evaluations.insert_one({"_id": result["id"], **result})
    return result


def latest_retrieval_evaluation(repo_id: str) -> dict | None:
    get_repository(repo_id)
    item = get_db().retrieval_evaluations.find_one({"repository_id": repo_id}, sort=[("created_at", -1)])
    if not item:
        return None
    item.pop("_id", None)
    return item
