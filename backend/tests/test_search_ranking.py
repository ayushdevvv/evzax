from app.services.search_ranking import reciprocal_rank_fusion


def test_rrf_merges_same_chunk_across_semantic_and_keyword_search():
    semantic = [{"version_id": "v1", "source_kind": "code", "file_path": "src/auth.py", "line_start": 10, "line_end": 20, "search_methods": ["semantic"]}]
    keyword = [{"version_id": "v1", "source_kind": "code", "file_path": "src/auth.py", "line_start": 10, "line_end": 20, "search_methods": ["keyword"]}]
    result = reciprocal_rank_fusion(semantic, keyword, 5)
    assert len(result) == 1
    assert result[0]["search_methods"] == ["semantic", "keyword"]
    assert result[0]["rrf_score"] > 0


def test_different_code_revisions_do_not_merge():
    semantic = [{"version_id": "v1", "source_kind": "code", "file_path": "src/auth.py", "line_start": 10, "line_end": 20}]
    keyword = [{"version_id": "v2", "source_kind": "code", "file_path": "src/auth.py", "line_start": 10, "line_end": 20}]
    assert len(reciprocal_rank_fusion(semantic, keyword, 5)) == 2
