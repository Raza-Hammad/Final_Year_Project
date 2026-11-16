# Google Sign-In — Console checklist (Cascadyx)

Fixes the popup error:

```
Access blocked: Authorization Error
no registered origin
Error 401: invalid_client
flowName=GeneralOAuthFlow
```

## What the error means

Cascadyx loads the Client ID from the backend (`GET /api/auth/google/config`, from `GOOGLE_CLIENT_ID` in `backend/env` or `backend/.env`) and passes it to Google Identity Services (GIS). The code path is correct: the server Client ID is a well-formed Web client id and the frontend uses exactly that value.

`no registered origin` is raised **by Google**, before any Cascadyx code runs: the page you clicked "Continue with Google" on has an origin (`scheme://host:port`) that is **not listed** under that OAuth client's **Authorized JavaScript origins**. This is a Google Cloud Console setting, not something the app can fix in code. It affects every user, regardless of which Google account signs in.

## Exact Console steps

You must be an **Owner / Editor** (or have `OAuth Config Editor`) on the Google Cloud project that owns the Client ID. The project number is the first part of the Client ID (`612981678533-…`). If `khanizhan59@gmail.com` is not on that project, ask the owner to either add you (IAM → Grant access → role *Editor*) or perform these steps.

1. Open <https://console.cloud.google.com/apis/credentials> and select the project that owns the Client ID.
2. Under **OAuth 2.0 Client IDs**, click the client whose ID starts with `612981678533-` (check the full ID matches `GOOGLE_CLIENT_ID`).
   - Its **Application type must be `Web application`**. Android / iOS / Desktop / "TVs" clients cannot be used with GIS popup and also yield `invalid_client`. If it is not Web, create a new Web client and put the new id/secret in the env file.
3. **Authorized JavaScript origins → ADD URI** — add every origin you open in a browser (no path, no trailing slash):
   - `http://127.0.0.1:5173`
   - `http://localhost:5173`
   - `http://127.0.0.1:8000`
   - `http://localhost:8000`
   - Production later: `https://YOUR_DOMAIN`
4. **Authorized redirect URIs → ADD URI** (used by the redirect fallback; must match `GOOGLE_REDIRECT_URI` exactly):
   - `http://127.0.0.1:8000/api/auth/google/callback`
   - Production later: `https://YOUR_DOMAIN/api/auth/google/callback`
   - GIS popup mode uses the special `postmessage` redirect — it is **not** entered in the Console.
5. Click **Save**. Changes can take **5 minutes up to a few hours** to propagate; retry in an Incognito window after a few minutes.
6. **OAuth consent screen** (<https://console.cloud.google.com/apis/credentials/consent>):
   - If *Publishing status* is **Testing**, only listed users can sign in. Under **Test users → Add users**, add `khanizhan59@gmail.com` (and any evaluator accounts). A non-listed user sees a different error (`access_denied` / "app not verified"), not `no registered origin`.
   - Scopes needed are only `openid`, `email`, `profile` (non-sensitive, no verification review).
7. Open the app with an origin from step 3 (e.g. `http://127.0.0.1:5173`), click **Continue with Google**.

> `http://127.0.0.1:5173` and `http://localhost:5173` are **different origins** to Google. Register both, or always use one.

> **Public deployment (free, Render):** register `https://cascadyx.onrender.com` (use the exact host Render shows you) as an **Authorized JavaScript origin** and `https://cascadyx.onrender.com/api/auth/google/callback` as an **Authorized redirect URI**. Don't set `GOOGLE_REDIRECT_URI` on Render — it is derived automatically from Render's `RENDER_EXTERNAL_URL` (or `PUBLIC_BASE_URL` if set). Publish the consent screen so non-test users can sign in. Full steps: [`GO_LIVE.md`](GO_LIVE.md) Step 5.

## Backend env file

`backend/env` (legacy name) or `backend/.env`:

```
GOOGLE_CLIENT_ID=<digits>-<hash>.apps.googleusercontent.com   # from the SAME Web client as above
GOOGLE_CLIENT_SECRET=GOCSPX-…                                  # server only, never commit
GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/api/auth/google/callback
# Optional extra origins allowed as post-login redirect targets:
# GOOGLE_FRONTEND_ORIGINS=https://cascadyx.example.com
```

Restart the backend after editing (`uvicorn` does not re-read env files). The secret and client id must come from the **same** OAuth client, otherwise the server-side code exchange fails with `invalid_client` / `unauthorized_client` *after* the popup succeeds.

## Verify (no secrets printed)

```powershell
curl.exe -s http://127.0.0.1:8000/api/auth/google/config
```

Expect `"enabled": true`, `"client_id": "<digits>-….apps.googleusercontent.com"`, `"client_id_looks_valid": true`, and `required_origins` listing the origins to register. If `client_id_looks_valid` is `false` the id is a placeholder or typo.

The app also helps in the browser: if the popup closes/fails, the login card shows the exact `window.location.origin` that has to be registered.

## Quick diagnosis table

| Symptom | Cause | Fix |
|---|---|---|
| `no registered origin` / `401 invalid_client` in popup | Page origin not in Authorized JavaScript origins | Step 3, exact scheme+host+port |
| `invalid_client` and `The OAuth client was not found` | Client ID typo / deleted client / wrong project | Copy ID from Console into env |
| `invalid_client` immediately, origin is registered | Client type is not *Web application* | Create a Web client |
| `redirect_uri_mismatch` (redirect fallback) | Redirect URI differs by even one character | Step 4 |
| `access_denied` / "has not completed Google verification" | User not in *Test users* | Step 6 |
| Popup succeeds, then "Failed to exchange Google authorization code" | Secret doesn't belong to this client id | Use the secret from the same client; restart backend |
