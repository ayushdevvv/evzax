import httpx
from app.core.config import settings
from app.core.errors import integration_error

JINA_URL = "https://api.jina.ai/v1/embeddings"


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not settings.jina_api_key:
        raise integration_error("Jina AI")
    if not texts:
        return []
    all_vectors: list[list[float] | None] = [None] * len(texts)
    headers = {"Authorization": f"Bearer {settings.jina_api_key}", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=httpx.Timeout(75.0, connect=15.0)) as client:
            for offset in range(0, len(texts), 32):
                batch = texts[offset:offset + 32]
                response = client.post(JINA_URL, headers=headers, json={
                    "model": settings.jina_embedding_model,
                    "input": batch,
                    "normalized": True,
                })
                if response.status_code >= 400:
                    raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")
                data = response.json().get("data", [])
                if len(data) != len(batch):
                    raise RuntimeError("Embedding provider returned an unexpected number of vectors.")
                for item in data:
                    index = offset + int(item.get("index", 0))
                    all_vectors[index] = item["embedding"]
    except (httpx.HTTPError, ValueError, KeyError, RuntimeError) as exc:
        raise integration_error("Jina AI embeddings", str(exc)[:280]) from exc
    vectors = [vector for vector in all_vectors if vector is not None]
    if len(vectors) != len(texts):
        raise integration_error("Jina AI embeddings", "Some embeddings were missing from the response.")
    dimensions = {len(vector) for vector in vectors}
    if dimensions != {settings.pinecone_dimension}:
        raise integration_error(
            "Embedding dimension configuration",
            f"Jina returned {sorted(dimensions)} but PINECONE_DIMENSION is {settings.pinecone_dimension}. Set up a compatible Pinecone index.",
        )
    return vectors
