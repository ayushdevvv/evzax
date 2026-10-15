# Evzax backend

FastAPI API with repository and ZIP ingestion, code Q&A, hosted semantic embeddings, MongoDB keyword retrieval, supplementary document uploads, revision diffs, adaptive retrieval, and retrieval evaluation.

## Local setup

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
uvicorn app.main:app --reload --port 8000
```

Configure MongoDB Atlas, Pinecone, Jina AI, Groq, and authentication settings in `.env`. Set `AUTH_JWT_SECRET` to a unique random value of at least 32 characters. Never commit `.env`. For production cross site cookies, set `AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_SAMESITE=none`, and the exact frontend origin; HTTPS is required. Create a Pinecone dense index named `gitcontext-code` with 768 dimensions and cosine similarity for `jina-embeddings-v2-base-code`.

## Main API operations

- `GET /api/health`: cloud connection configuration status.
- `GET /api/repositories`: indexed codebases.
- `POST /api/repositories/github`: create or update from a public GitHub repository.
- `POST /api/repositories/zip`: create or update from a ZIP snapshot.
- `POST /api/repositories/{id}/chat`: adaptive hybrid retrieval and grounded answer.
- `GET /api/repositories/{id}/documents`: list project reference files.
- `POST /api/repositories/{id}/documents`: upload PDF, DOCX, Markdown, text, CSV, JSON, YAML, HTML, or log file.
- `GET /api/repositories/{id}/documents/{document_id}/download`: download the original from Atlas GridFS.
- `DELETE /api/repositories/{id}/documents/{document_id}`: delete the original and indexed passages.
- `GET /api/repositories/{id}/versions`: revision history.
- `GET /api/repositories/{id}/versions/compare?from_version_id=...&to_version_id=...`: changed files and available unified diffs.
- `POST /api/repositories/{id}/activate`: choose the revision used by default.
- `POST /api/repositories/{id}/sync`: fetch the latest GitHub commit.
- `POST /api/repositories/{id}/evaluation`: compare semantic versus hybrid retrieval on labeled questions.

OpenAPI and API documentation endpoints are disabled in `app/main.py` by design. These routes are consumed by the React UI.

## Authentication and access

- Signup and login use server side accounts with scrypt password hashes. A signed JWT is stored in an HttpOnly cookie and backed by a revocable MongoDB session.
- Repository endpoints require an authenticated session. New repositories store their owner ID and are only visible to that account.
- Existing records without an owner ID are not automatically assigned to an account. Review and migrate legacy records explicitly before production use.
- Client error messages are normalized; provider and database exception details remain server side.

## Storage model

- MongoDB Atlas stores repositories, immutable revision manifests, sanitized source snapshots, code and document passage text, chat messages, retrieval test results, and uploaded originals in GridFS.
- Pinecone stores code vectors under a namespace per revision, while project reference documents use a separate repository namespace and carry the revision number from which they become applicable.
- Jina embeddings are generated through the hosted API; no embedding model or vector store is persisted locally.
- The deterministic retrieval policy picks a small context for precise queries and a larger context for debugging/architecture questions. Semantic and keyword rankings are merged with Reciprocal Rank Fusion.

## Tests

```powershell
python -m pytest tests -q
```

Live provider operations need cloud credentials, DNS resolution and Atlas Network Access. This starter is not yet multi tenant; keep it local until authentication, ownership authorization and rate limits are added.
