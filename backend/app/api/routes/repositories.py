from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from urllib.parse import quote
from pymongo.errors import ConfigurationError, PyMongoError, ServerSelectionTimeoutError

from app.db.mongo import get_db
from app.models.schemas import ActivateVersionRequest, ChatRequest, EvaluationRunRequest, GitHubConnectRequest
from app.services.chat_service import ask_repository, get_chat_history
from app.services.evaluation_service import latest_retrieval_evaluation, run_retrieval_evaluation
from app.services.documents_service import (
    delete_reference_document,
    download_reference_document,
    list_reference_documents,
    upload_reference_document,
)
from app.services.repository_service import (
    activate_version,
    compare_versions,
    fetch_github_snapshot,
    get_repository,
    index_snapshot,
    list_repositories,
    list_versions,
    read_zip_snapshot,
    sync_github_repository,
)

router = APIRouter(prefix="/repositories", tags=["repositories"])


def _database_guard(callable_, *args, **kwargs):
    try:
        return callable_(*args, **kwargs)
    except HTTPException:
        raise
    except (ConfigurationError, ServerSelectionTimeoutError, PyMongoError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=f"MongoDB is unavailable. Check backend/.env and Atlas network access. {str(exc).splitlines()[0][:200]}") from exc


@router.get("")
def repositories_list():
    return {"repositories": _database_guard(list_repositories)}


@router.post("/github")
def connect_github(payload: GitHubConnectRequest):
    return _database_guard(index_snapshot, fetch_github_snapshot(payload.repo_url, payload.ref), payload.existing_repo_id)


@router.post("/zip")
async def connect_zip(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    existing_repo_id: str | None = Form(default=None),
):
    snapshot = await read_zip_snapshot(file, name)
    return _database_guard(index_snapshot, snapshot, existing_repo_id)


@router.get("/{repo_id}")
def repository_detail(repo_id: str):
    repo = _database_guard(get_repository, repo_id)
    current = None
    if repo.get("current_version_id"):
        current = _database_guard(lambda: get_db().repo_versions.find_one({"_id": repo["current_version_id"]}))
        if current:
            current["id"] = current.pop("_id", "")
            current.pop("file_hashes", None)
    return {"repository": repo, "current_version": current}


@router.get("/{repo_id}/documents")
def repository_documents(repo_id: str):
    return {"documents": _database_guard(list_reference_documents, repo_id)}


@router.post("/{repo_id}/documents")
async def repository_document_upload(repo_id: str, file: UploadFile = File(...)):
    try:
        return await upload_reference_document(repo_id, file)
    except HTTPException:
        raise
    except (ConfigurationError, ServerSelectionTimeoutError, PyMongoError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=f"Document storage is unavailable. Check MongoDB Atlas and backend/.env. {str(exc).splitlines()[0][:200]}") from exc


@router.get("/{repo_id}/documents/{document_id}/download")
def repository_document_download(repo_id: str, document_id: str):
    content, filename, content_type = _database_guard(download_reference_document, repo_id, document_id)
    return Response(content=content, media_type=content_type, headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"})


@router.delete("/{repo_id}/documents/{document_id}")
def repository_document_delete(repo_id: str, document_id: str):
    return _database_guard(delete_reference_document, repo_id, document_id)


@router.get("/{repo_id}/versions")
def repository_versions(repo_id: str):
    return {"versions": _database_guard(list_versions, repo_id)}


@router.get("/{repo_id}/versions/compare")
def repository_versions_compare(repo_id: str, from_version_id: str, to_version_id: str):
    return _database_guard(compare_versions, repo_id, from_version_id, to_version_id)


@router.post("/{repo_id}/sync")
def repository_sync(repo_id: str):
    return _database_guard(sync_github_repository, repo_id)


@router.post("/{repo_id}/activate")
def repository_activate(repo_id: str, payload: ActivateVersionRequest):
    return _database_guard(activate_version, repo_id, payload.version_id)


@router.get("/{repo_id}/evaluation")
def repository_evaluation_latest(repo_id: str):
    return {"evaluation": _database_guard(latest_retrieval_evaluation, repo_id)}


@router.post("/{repo_id}/evaluation")
def repository_evaluation_run(repo_id: str, payload: EvaluationRunRequest):
    cases = [case.model_dump() for case in payload.cases]
    return _database_guard(run_retrieval_evaluation, repo_id, payload.version_id, payload.k, cases)


@router.post("/{repo_id}/chat")
def repository_chat(repo_id: str, payload: ChatRequest):
    return _database_guard(ask_repository, repo_id, payload.question, payload.version_id)


@router.get("/{repo_id}/messages")
def repository_messages(repo_id: str, version_id: str | None = None):
    return {"messages": _database_guard(get_chat_history, repo_id, version_id)}
