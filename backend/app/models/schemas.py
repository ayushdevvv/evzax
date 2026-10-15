from pydantic import BaseModel, Field, HttpUrl, ConfigDict
from typing import Literal


class GitHubConnectRequest(BaseModel):
    repo_url: str = Field(min_length=10, max_length=500)
    existing_repo_id: str | None = None
    ref: str | None = Field(default=None, max_length=120)


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=4000)
    version_id: str | None = None


class ActivateVersionRequest(BaseModel):
    version_id: str


class RepositorySummary(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    name: str
    source_type: Literal["github", "zip"]
    source_url: str | None = None
    default_branch: str | None = None
    current_version_id: str | None = None
    current_revision: str | None = None
    status: str = "ready"
    file_count: int = 0
    chunk_count: int = 0
    created_at: str
    updated_at: str


class ChatCitation(BaseModel):
    file_path: str
    line_start: int
    line_end: int
    language: str = "text"
    symbol: str | None = None
    snippet: str
    score: float | None = None
    url: str | None = None


class ChatResponse(BaseModel):
    answer: str
    repository_id: str
    version_id: str
    revision: str | None = None
    citations: list[ChatCitation]
    retrieval_count: int


class EvaluationCase(BaseModel):
    question: str = Field(min_length=3, max_length=2500)
    relevant_paths: list[str] = Field(min_length=1, max_length=20)


class EvaluationRunRequest(BaseModel):
    version_id: str | None = None
    k: int = Field(default=5, ge=1, le=20)
    cases: list[EvaluationCase] = Field(min_length=1, max_length=30)
