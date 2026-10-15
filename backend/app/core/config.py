from functools import lru_cache
from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    mongodb_uri: str = ""
    mongodb_database: str = "gitcontext"
    pinecone_api_key: str = ""
    pinecone_index_name: str = "gitcontext-code"
    pinecone_dimension: int = 768
    jina_api_key: str = ""
    jina_embedding_model: str = "jina-embeddings-v2-base-code"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    github_token: str = ""
    frontend_origin: str = "http://localhost:5173"
    auth_jwt_secret: str = ""
    auth_jwt_issuer: str = "evzax"
    auth_cookie_name: str = "evzax_session"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"
    auth_session_minutes: int = 10080
    auth_trust_proxy: bool = False
    max_upload_mb: int = 60
    max_repository_files: int = 4000
    max_file_bytes: int = 1_000_000
    max_code_chunks: int = 8000
    max_repository_mb: int = 100
    max_archive_mb: int = 250
    github_fetch_workers: int = 24
    repo_connects_per_hour: int = 300
    max_document_mb: int = 20
    max_document_pages: int = 300
    max_document_chunks: int = 1200

    @model_validator(mode="after")
    def _normalize_cookie_policy(self):
        samesite = (self.auth_cookie_samesite or "lax").strip().lower()
        if samesite not in {"lax", "strict", "none"}:
            samesite = "lax"
        self.auth_cookie_samesite = samesite
        if samesite == "none":
            self.auth_cookie_secure = True
        return self

    @property
    def allowed_frontend_origins(self) -> list[str]:
        values = (value.strip().rstrip("/") for value in self.frontend_origin.split(","))
        return list(dict.fromkeys(value for value in values if value))

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
