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


## Repository fetching and responsive navigation pass

- Increased configurable repository ingestion defaults to 2,500 source files, 750 KB per file, a 60 MB total budget, and 5,000 code chunks. Tune these for the deployed Render instance's memory limits.
- GitHub fetching retries temporary 429/5xx responses and transient HTTP errors with bounded backoff.
- Repository candidates are scored to favor application source over generated output, large files, and low-signal fixtures.
- GitHub URLs accept scheme-less `github.com/owner/repo` and `www.github.com/owner/repo` inputs as well as full URLs. Host validation remains strict.
- Added direct Documents, Versions, and Retrieval lab links in the workspace sidebar, targeting the active repository or first available repository.
- Improved phone spacing and typography for auth cards and workspace pages; the app sidebar now behaves as a backdrop-backed covering drawer on smaller screens.

## Validation for this pass

- Python bytecode compilation completed.
- Pytest could not collect tests in this environment because `pymongo` is not installed; tests are not claimed to pass.
- Frontend build was not verified because dependency installation did not complete in the sandbox. Run `npm ci` then `npm run build`.


## Auth conflicts, session state and fetch capacity pass

Auth conflicts fixed
- Wrong password, duplicate email and "too many attempts" now show the backend's own message instead of "Please sign in again" / "conflicts with the current state". 4xx details are shown only when they are short plain strings; 5xx stays generic.
- Auth form errors no longer also fire a toast (one message, not two). Health polling and the boot `/auth/me` check are silent, so an API that is down no longer toasts every 30 seconds.
- Logout is idempotent: it clears the cookie and succeeds even if the session already expired.
- Successful login clears that email/IP's failed-attempt counter (previously 7 old typos still counted toward the limit).
- `AUTH_TRUST_PROXY=true` makes throttling use the real client IP (last X-Forwarded-For hop). Without it, behind Render every user shares the proxy IP, so anyone could lock a victim out by failing 8 logins for their email.
- Unknown-email logins now spend the same hashing time as wrong-password logins.
- `SameSite=None` now forces `Secure` (browsers silently drop the cookie otherwise); invalid SameSite values fall back to `lax`.
- Auth responses send `Cache-Control: no-store`. 422 validation errors no longer echo submitted values.
- Post-login redirect only accepts same-site paths.

State changes fixed
- Any 401 from an API call now signs the UI out and returns to /login with the original page remembered (before, the user stayed "signed in" and every page just errored).
- A server blip or cold start during the session check no longer logs you out: the boot check retries (1.5s, 3s, 6s), then shows a retry screen instead of redirecting to /login.
- Sign-in/out bumps an epoch so a slower older `/auth/me` response cannot overwrite the new state.
- Sign-out always clears local state first; focus/visibility re-check picks up sign-outs from other tabs.
- The sidebar keeps its last good repository list when a refresh fails and refetches on account change.
- Identical toasts within 3 seconds are collapsed.

Fetch capacity
- GitHub repositories are now read from one archive download (1 API call) instead of one request per file, with the per-file path kept as a fallback for repositories over `MAX_ARCHIVE_MB`.
- Defaults raised: 4000 files, 1 MB per file, 8000 chunks, 100 MB per repository (all env-tunable); parallel fallback fetch raised from 12 to 24 workers.
- GitHub rate-limit responses (403 with remaining=0, or 429) now report a reset time in minutes, are not retried pointlessly, and no longer leak the provider URL in a 502.

Not verified here
- Backend dependencies and `npm ci` were unavailable in the sandbox. Only the archive reader and client-IP logic were exercised in isolation; the new pytest files and the Vite build need a run on your machine.
- Signup has no rate limit yet. Safari and some browsers block third-party cookies between vercel.app and onrender.com; a custom domain for both (or proxying /api through the frontend host) is the durable fix.
