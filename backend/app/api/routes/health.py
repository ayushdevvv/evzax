from fastapi import APIRouter
from app.core.config import settings
from app.db.mongo import ping_database

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    mongo_ok, mongo_error = ping_database() if settings.mongodb_uri else (False, "MONGODB_URI is not configured")
    return {
        "status": "ok" if mongo_ok else "degraded",
        "services": {
            "mongodb": {"configured": bool(settings.mongodb_uri), "connected": mongo_ok, "message": mongo_error},
            "pinecone": {"configured": bool(settings.pinecone_api_key and settings.pinecone_index_name)},
            "jina": {"configured": bool(settings.jina_api_key)},
            "groq": {"configured": bool(settings.groq_api_key)},
        },
    }
