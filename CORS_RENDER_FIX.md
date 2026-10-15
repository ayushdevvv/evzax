# EVZAX Render + Vercel CORS fix

In Render → your backend Web Service → Environment, set:

- `FRONTEND_ORIGIN` = `https://evzax.vercel.app`
- `AUTH_COOKIE_SECURE` = `true`
- `AUTH_COOKIE_SAMESITE` = `none`

Use the exact origin only: no `https\\://`, no trailing slash, no path, and no spaces. The backend now accepts a comma-separated `FRONTEND_ORIGIN` list if you need more than one exact origin, for example `https://evzax.vercel.app,http://localhost:5173`.

In Vercel → Project → Settings → Environment Variables, set:

- `VITE_API_BASE_URL` = `https://evzax.onrender.com/api`

Then redeploy the Vercel frontend (Vite environment variables are built into the static bundle) and restart/redeploy the Render backend after changing its variables.

The frontend API helper already uses `credentials: 'include'`. Because `vercel.app` and `onrender.com` are cross-site, production auth cookies need HTTPS with `Secure` and `SameSite=None`.

To verify the preflight from PowerShell:

```powershell
curl.exe -i -X OPTIONS "https://evzax.onrender.com/api/repositories/github" `
  -H "Origin: https://evzax.vercel.app" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: content-type"
```

A successful preflight should return `200 OK` and include:

- `access-control-allow-origin: https://evzax.vercel.app`
- `access-control-allow-credentials: true`
- an `access-control-allow-methods` header including `POST`

Do not use `allow_origins=['*']` with credentialed authentication.
