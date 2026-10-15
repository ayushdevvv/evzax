from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from urllib.parse import quote
from pymongo.errors import ConfigurationError, PyMongoError, ServerSelectionTimeoutError

from app.db.mongo import get_db
from app.core.auth import current_user
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
    check_connect_budget,
    compare_versions,
    fetch_github_snapshot,
    get_repository,
    index_snapshot,
    list_repositories,
    list_versions,
    read_zip_snapshot,
    sync_github_repository,
)

router = APIRouter(prefix="/repositories", tags=["repositories"], dependencies=[Depends(current_user)])


def _require_owner(repo_id: str, user: dict) -> None:
    repo = get_db().repositories.find_one({"_id": repo_id}, {"owner_id": 1})
    if not repo or repo.get("owner_id") != user.get("id"):
        # Do not disclose whether another user's repository exists.
        raise HTTPException(status_code=404, detail="Repository was not found.")


def _owned_repository(repo_id: str, user: dict = Depends(current_user)) -> None:
    _require_owner(repo_id, user)


def _database_guard(callable_, *args, **kwargs):
    try:
        return callable_(*args, **kwargs)
    except HTTPException:
        raise
    except (ConfigurationError, ServerSelectionTimeoutError, PyMongoError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail="We could not load your workspace right now. Please try again shortly.") from exc


@router.get("")
def repositories_list(user: dict = Depends(current_user)):
    return {"repositories": _database_guard(list_repositories, user["id"])}


@router.post("/github")
def connect_github(payload: GitHubConnectRequest, user: dict = Depends(current_user)):
    if payload.existing_repo_id:
        _require_owner(payload.existing_repo_id, user)
    check_connect_budget(user["id"])
    return _database_guard(index_snapshot, fetch_github_snapshot(payload.repo_url, payload.ref), payload.existing_repo_id, user["id"])


@router.post("/zip")
async def connect_zip(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    existing_repo_id: str | None = Form(default=None),
    user: dict = Depends(current_user),
):
    if existing_repo_id:
        _require_owner(existing_repo_id, user)
    snapshot = await read_zip_snapshot(file, name)
    return _database_guard(index_snapshot, snapshot, existing_repo_id, user["id"])


@router.get("/{repo_id}", dependencies=[Depends(_owned_repository)])
def repository_detail(repo_id: str):
    repo = _database_guard(get_repository, repo_id)
    current = None
    if repo.get("current_version_id"):
        current = _database_guard(lambda: get_db().repo_versions.find_one({"_id": repo["current_version_id"]}))
        if current:
            current["id"] = current.pop("_id", "")
            current.pop("file_hashes", None)
    return {"repository": repo, "current_version": current}


@router.get("/{repo_id}/documents", dependencies=[Depends(_owned_repository)])
def repository_documents(repo_id: str):
    return {"documents": _database_guard(list_reference_documents, repo_id)}


@router.post("/{repo_id}/documents", dependencies=[Depends(_owned_repository)])
async def repository_document_upload(repo_id: str, file: UploadFile = File(...)):
    try:
        return await upload_reference_document(repo_id, file)
    except HTTPException:
        raise
    except (ConfigurationError, ServerSelectionTimeoutError, PyMongoError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail="Your document could not be processed right now. Please try again shortly.") from exc


@router.get("/{repo_id}/documents/{document_id}/download", dependencies=[Depends(_owned_repository)])
def repository_document_download(repo_id: str, document_id: str):
    content, filename, content_type = _database_guard(download_reference_document, repo_id, document_id)
    return Response(content=content, media_type=content_type, headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"})


@router.delete("/{repo_id}/documents/{document_id}", dependencies=[Depends(_owned_repository)])
def repository_document_delete(repo_id: str, document_id: str):
    return _database_guard(delete_reference_document, repo_id, document_id)


@router.get("/{repo_id}/versions", dependencies=[Depends(_owned_repository)])
def repository_versions(repo_id: str):
    return {"versions": _database_guard(list_versions, repo_id)}


@router.get("/{repo_id}/versions/compare", dependencies=[Depends(_owned_repository)])
def repository_versions_compare(repo_id: str, from_version_id: str, to_version_id: str):
    return _database_guard(compare_versions, repo_id, from_version_id, to_version_id)


@router.post("/{repo_id}/sync", dependencies=[Depends(_owned_repository)])
def repository_sync(repo_id: str):
    return _database_guard(sync_github_repository, repo_id)


@router.post("/{repo_id}/activate", dependencies=[Depends(_owned_repository)])
def repository_activate(repo_id: str, payload: ActivateVersionRequest):
    return _database_guard(activate_version, repo_id, payload.version_id)


@router.get("/{repo_id}/evaluation", dependencies=[Depends(_owned_repository)])
def repository_evaluation_latest(repo_id: str):
    return {"evaluation": _database_guard(latest_retrieval_evaluation, repo_id)}


@router.post("/{repo_id}/evaluation", dependencies=[Depends(_owned_repository)])
def repository_evaluation_run(repo_id: str, payload: EvaluationRunRequest):
    cases = [case.model_dump() for case in payload.cases]
    return _database_guard(run_retrieval_evaluation, repo_id, payload.version_id, payload.k, cases)


@router.post("/{repo_id}/chat", dependencies=[Depends(_owned_repository)])
def repository_chat(repo_id: str, payload: ChatRequest):
    return _database_guard(ask_repository, repo_id, payload.question, payload.version_id)


@router.get("/{repo_id}/messages", dependencies=[Depends(_owned_repository)])
def repository_messages(repo_id: str, version_id: str | None = None):
    return {"messages": _database_guard(get_chat_history, repo_id, version_id)}
