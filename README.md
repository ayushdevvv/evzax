# Evzax

**Understand the codebase. Trace the evidence. Debug with context.**

Evzax is a codebase RAG workspace. Connect a public GitHub repository or upload a ZIP, add project reference documents, ask questions about code paths, and receive grounded answers with file paths, line ranges, PDF pages, and source snippets. Revisions are kept separately so you can chat against an earlier commit and compare snapshots.

## Product capabilities

### Connect a codebase
- Public GitHub URL with optional branch or commit ref.
- ZIP upload for local or private projects without connecting GitHub.
- Shared indexing path, path traversal protection, extension filters, file size limits, dependency exclusions, and best effort secret line redaction.
- Source snippets retain line metadata. Python functions and classes are identified with AST metadata when the source parses.

### Codebase chat
- Grounded explanations for architecture, functions, request flows, errors, and stack traces.
- Clickable GitHub citations pinned to the indexed commit when a repository URL is available.
- Expandable snippets with exact source locations.
- The model is instructed to separate confirmed evidence from likely causes and not invent locations or test results.

### Reference documents
- Attach PDF, DOCX, Markdown, TXT, RST, CSV, JSON, YAML, HTML, and log files to a codebase.
- Originals are stored in MongoDB Atlas GridFS. Extracted passages are stored in Atlas for keyword retrieval and indexed in Pinecone for semantic search.
- PDF answers cite page numbers. Documents are available from the code revision at which they were added onward, not in earlier revision chats.
- Scanned PDFs without a text layer are reported as unreadable; OCR is not included.

### Hybrid and adaptive retrieval
- Semantic search with Jina embeddings and Pinecone.
- Keyword retrieval through a MongoDB text index, with a bounded regex fallback.
- Reciprocal Rank Fusion combines keyword and semantic ranks instead of comparing provider scores that are on different scales.
- A deterministic adaptive policy skips retrieval for simple greetings, uses targeted retrieval for specific file or symbol questions, and retrieves deeper context for stack traces, architecture, and multi step debugging questions.
- Answers show whether hybrid retrieval was used and the selected retrieval depth.

### Revision intelligence
- Each GitHub sync or ZIP update creates a new indexed revision.
- Select a historical revision for chat and activate any ready revision as current.
- Compare any two indexed revisions. Added, modified, and removed paths are listed, with unified line diffs when sanitized snapshot content is available.
- Reference documents are revision aware: they are available from the revision number at which they were indexed and forward.

### Retrieval Lab
- Label expected file paths for a set of questions.
- Compare semantic retrieval with hybrid retrieval using Recall@K, Precision@K, MRR, mean latency, and p95 retrieval latency.
- Evaluation uses the current repository index and your labels. It does not claim correctness without ground truth.
- Pinecone manages the underlying ANN index, so its internal HNSW parameters and memory footprint are not exposed by this application. The lab benchmarks retrieval quality, not Pinecone internals.

## Technology stack

| Layer | Technology | Role |
|---|---|---|
| UI | React, Vite, React Router, Framer Motion | Landing page, overview, code chat, reference library, revision history, retrieval lab |
| API | FastAPI, Pydantic | Upload, indexing, chat, comparisons, evaluation |
| Orchestration | LangChain | Grounded prompt and Groq model invocation |
| Answer model | Groq API | Code explanations and debugging analysis |
| Embeddings | Jina AI hosted API | Source code and reference document embeddings |
| Vector search | Pinecone | Revision scoped code and repository scoped reference document vectors |
| Keyword search and metadata | MongoDB Atlas | Text index, metadata, messages, revision manifests, sanitized source snapshots |
| Original document files | MongoDB Atlas GridFS | Cloud persistence for uploaded reference files |
| Repository source | GitHub REST API | Public repository trees, commits and source retrieval |

The browser receives only the public API base URL. Provider credentials remain in `backend/.env`; the frontend `.env` must never contain API keys. The repository contains example templates only.

## Setup on Windows

### 1. Configure providers

Create a MongoDB Atlas cluster and database user, a Pinecone dense index, a Jina API key, and a Groq API key. For GitHub public repositories, `GITHUB_TOKEN` is optional but helps with API rate limits.

Create the backend environment file:

```powershell
cd backend
Copy-Item .env.example .env
notepad .env
```

Set these values in `backend/.env`:

```dotenv
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/?retryWrites=true&w=majority
MONGODB_DATABASE=gitcontext
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=gitcontext-code
PINECONE_DIMENSION=768
JINA_API_KEY=your_jina_key
JINA_EMBEDDING_MODEL=jina-embeddings-v2-base-code
GROQ_API_KEY=your_groq_key
GROQ_MODEL=openai/gpt-oss-120b
FRONTEND_ORIGIN=http://localhost:5173
AUTH_JWT_SECRET=use_a_unique_random_secret_at_least_32_characters_long
AUTH_JWT_ISSUER=evzax
AUTH_COOKIE_NAME=evzax_session
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAMESITE=lax
AUTH_SESSION_MINUTES=10080
MAX_UPLOAD_MB=40
MAX_REPOSITORY_FILES=1200
MAX_FILE_BYTES=500000
MAX_CODE_CHUNKS=3000
MAX_DOCUMENT_MB=20
MAX_DOCUMENT_PAGES=300
MAX_DOCUMENT_CHUNKS=1200
```

Do not commit `.env`. The root `.gitignore` ignores real environment files and permits only `.env.example` templates. EVZAX now uses server backed accounts, scrypt password hashing, JWT session cookies, revocable MongoDB sessions, login throttling, and repository ownership checks. For a deployed frontend and API on separate sites, set `AUTH_COOKIE_SECURE=true` and `AUTH_COOKIE_SAMESITE=none`, configure the exact deployed `FRONTEND_ORIGIN`, and use HTTPS for both. Use a cryptographically random JWT secret of at least 32 characters.

### 2. Create the Pinecone index

Create a **dense index named `gitcontext-code`, dimension `768`, metric `cosine`** to match the configured Jina embedding model. Code revisions use separate namespaces. Reference document vectors use a namespace dedicated to the repository, with revision metadata for historical filtering.

### 3. Install and run FastAPI

Use Python 3.12:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run these commands from the `backend` directory. API docs and OpenAPI routes are disabled in the app UI configuration; use the product interface for normal use.

### 4. Run React

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. `frontend/.env.example` contains only `VITE_API_BASE_URL`; it is safe to change this public URL for a different API host, but never place provider keys in Vite variables.

## Suggested flow

1. Connect a small public repository or upload a ZIP.
2. Ask a simple question and inspect the returned file and line citations.
3. Paste a stack trace to test targeted bug retrieval.
4. Add an architecture note or API specification in **Reference docs** and ask about a behaviour described in that document.
5. Sync GitHub or upload a new ZIP, compare revisions, and ask the same question against the old and new revision.
6. In **Retrieval lab**, label the correct file path for a few questions and compare semantic and hybrid metrics.

## Project architecture

```text
gitcontext/
├── backend/
│   ├── app/
│   │   ├── api/routes/             # FastAPI routes
│   │   ├── core/                   # Settings and clean API errors
│   │   ├── db/                     # MongoDB connection
│   │   ├── models/                  # Pydantic API schemas
│   │   └── services/
│   │       ├── repository_service.py
│   │       ├── documents_service.py
│   │       ├── code_parser.py
│   │       ├── embedding_service.py
│   │       ├── vector_service.py
│   │       ├── search_ranking.py
│   │       ├── retrieval_policy.py
│   │       ├── chat_service.py
│   │       └── evaluation_service.py
│   └── tests/
└── frontend/
    └── src/
        ├── components/
        ├── components/layout/
        ├── components/repository/
        ├── pages/
        └── lib/
```

## Limits and operational notes

- ZIP maximum: `MAX_UPLOAD_MB` (default 40 MB); source file maximum: `MAX_FILE_BYTES` (default 500 KB); the code index is capped at `MAX_REPOSITORY_FILES` files and `MAX_CODE_CHUNKS` chunks.
- Reference document maximum: 20 MB by default, up to 300 PDF pages and 1,200 chunks per file.
- Indexing is synchronous in the API request. Large projects can take a while; a background job queue is a later scaling step.
- MongoDB text indexing and vector operations require cloud access. No local vector store, local embedding model, or local upload persistence is used.
- If MongoDB SRV DNS times out, verify the Atlas cluster hostname, database user, Network Access allowlist, active cluster, and DNS/network access. The error occurs before GridFS can store the upload.
- Embedding or Groq errors are returned as API errors. Quotas and availability depend on the providers and account plan.
- EVZAX now has cookie based authentication and per account repository ownership checks. Before a high traffic public launch, add distributed request rate limits, background indexing jobs, audit logging, durable job state, and operational monitoring. Private GitHub repositories are not supported by the public URL connector.
- Secret detection is best effort. Do not upload repositories that contain credentials unless you have reviewed and sanitized them first.

## Tests

From the `backend` folder:

```powershell
python -m pytest tests -q
```

Tests cover source filtering and line chunking, adaptive retrieval routing, and semantic/keyword result fusion. Live provider integration requires credentials and is not covered by the offline unit tests.
## Fix for `language override unsupported: javascript`

Evzax stores each chunk's programming language in the `language` field. MongoDB text indexes also use a field named `language` as their default per-document text-search language override, which makes values such as `javascript` invalid. The index configuration now uses `textSearchLanguage` for that override instead.

The backend now checks for and drops an incompatible legacy text index before recreating the corrected one. If the index cannot be migrated due to Atlas permissions, drop the old text index manually in MongoDB Atlas Data Explorer (collection `repo_chunks`, Indexes tab):

```javascript
use <your-configured-database-name>
db.repo_chunks.dropIndex("gitcontext_chunks_text")
```

Then restart the backend and retry indexing. The app will recreate the text index with the corrected `language_override`. Don't delete the `repo_chunks` collection or its data. If your text index has a different name, inspect `db.repo_chunks.getIndexes()` and drop the existing text index by its actual name.

