def _canonical_key(hit: dict) -> str:
    if hit.get("source_kind") == "document":
        return "|".join([
            "document", str(hit.get("document_id", "")), str(hit.get("file_path", "")),
            str(hit.get("page_number", 0)), str(hit.get("line_start", 1)), str(hit.get("line_end", 1)),
        ])
    return "|".join([
        "code", str(hit.get("version_id", "")), str(hit.get("file_path", "")),
        str(hit.get("line_start", 1)), str(hit.get("line_end", 1)),
    ])


def reciprocal_rank_fusion(vector_hits: list[dict], keyword_hits: list[dict], top_k: int) -> list[dict]:
    """Fuse semantic and lexical rankings using RRF without comparing unlike provider scores."""
    combined: dict[str, dict] = {}
    for method, hits in (("semantic", vector_hits), ("keyword", keyword_hits)):
        for rank, hit in enumerate(hits, start=1):
            key = _canonical_key(hit)
            row = combined.setdefault(key, dict(hit))
            row["rrf_score"] = row.get("rrf_score", 0.0) + 1.0 / (60 + rank)
            methods = set(row.get("search_methods", []))
            methods.add(method)
            row["search_methods"] = [name for name in ("semantic", "keyword") if name in methods]
    return sorted(combined.values(), key=lambda row: row.get("rrf_score", 0), reverse=True)[:top_k]
