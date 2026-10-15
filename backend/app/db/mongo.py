from functools import lru_cache
from pymongo import MongoClient
from pymongo.errors import PyMongoError, ConfigurationError, ServerSelectionTimeoutError
from app.core.config import settings

_client: MongoClient | None = None


def get_client() -> MongoClient:
    global _client
    if not settings.mongodb_uri:
        raise RuntimeError("MongoDB is not configured. Add MONGODB_URI to backend/.env.")
    if _client is None:
        _client = MongoClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=6000,
            connectTimeoutMS=6000,
            appname="GitContext",
        )
    return _client


def get_db():
    return get_client()[settings.mongodb_database]


def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def ping_database() -> tuple[bool, str | None]:
    try:
        get_client().admin.command("ping")
        return True, None
    except (ConfigurationError, ServerSelectionTimeoutError, PyMongoError, RuntimeError) as exc:
        return False, str(exc).splitlines()[0][:220]
