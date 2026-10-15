# EVZAX audit notes

## Fixed in this pass

- Added a shared dark glass toast system with check, error, warning, and info states, a dismiss action, timed progress indicator, and accessible live announcements.
- Normalized frontend API errors. The UI no longer renders provider SDK text, database hosts, server file paths, or raw backend exception messages.
- Added a generic backend 500 response while retaining full exception details in server logs.
- Connected the existing signup/login UI to the server side auth routes rather than localStorage-only accounts.
- Added the auth router to FastAPI, which was missing from the app registration.
- Added JWT configuration settings and documented the production cookie settings.
- Added signed HttpOnly session cookies, server-side revocation, password hashing, and login attempt throttling through the existing auth service.
- Required a valid session for repository APIs and added per-owner repository checks. Newly connected repositories store the account owner ID.
- Hid owner IDs, file hash manifests, and indexing exception details from serialized repository responses.
- Added success toasts for connecting a codebase, generating answers, indexing/removing documents, syncing/activating revisions, comparing revisions, and running retrieval evaluation.
- Added a migration path for an old MongoDB text index that incorrectly used the source-code `language` field as the text-search language override. This addresses `language override unsupported: javascript`.
- Updated setup docs with authentication and cross-site cookie deployment requirements.

## Verified

- Backend test suite: 9 passed.
- Python bytecode compilation: passed.
- Node syntax checks for `frontend/src/lib/api.js` and `frontend/vite.config.js`: passed.

## Not fully verified in this environment

- `npm ci` could not complete in the sandbox, so a full Vite production build was not verified here. Run `npm ci` and `npm run build` on the development machine.
- Live MongoDB Atlas, Pinecone, Jina, Groq, and browser cookie flows require the project's real environment values and cannot be integration tested without them.
- Existing repository records created before account ownership was added do not have an `owner_id` and are intentionally hidden from accounts until an explicit migration assigns ownership.

## Production setup reminders

- Create `backend/.env` from `backend/.env.example`; never put provider secrets in `frontend/.env`.
- Set a unique random `AUTH_JWT_SECRET` of at least 32 characters.
- For separate deployed frontend/API sites, use HTTPS, `AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_SAMESITE=none`, and the exact `FRONTEND_ORIGIN`.
- Keep the Pinecone dimension aligned with the configured Jina embedding model.
- Run live smoke tests for signup, login, logout, GitHub connect, ZIP upload, document upload, hybrid chat, historical revision selection, version comparison, and evaluation before public launch.
