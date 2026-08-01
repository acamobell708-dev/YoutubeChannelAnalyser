# YouTube Signal Lab web application handover

This document explains the current application as it exists in the repository,
how to run it locally, and the work required before it is hosted or the Google
OAuth app is opened to users beyond development test accounts.

It is intended to let a developer or AI continue the project without the
surrounding conversation history. Check `git status`, the root `README.md`, and
the tests before making changes; this project may have uncommitted local work.

## Current status at a glance

- The application is a Node.js/Express server with browser-side React
  dashboards. It is not a static-only React site.
- It uses the official YouTube Data API v3 for public metadata, statistics and
  comments.
- It uses the OpenAI Responses API with `gpt-5.4` by default for bounded,
  structured interpretation.
- The Video Dashboard implements Phase 1 public analysis and a limited Phase 2
  owner-authorised caption/transcript analysis.
- Google OAuth is implemented in code, but is optional. Without login, public
  analysis still runs and owner-dependent fields are returned as `Unknown`.
- The repository's current GitHub Actions workflow is CI only: it tests and
  builds on pushes and pull requests. It does not build an image or deploy to
  Azure or any other host.
- There is no Dockerfile, infrastructure-as-code file, hosting resource, or
  continuous deployment workflow in this repository yet.

## Architecture

```text
Browser (public/)
  VideoDashboard.html + React client
        |
        | same-origin JSON requests and HttpOnly cookies
        v
Express server (src/)
  routes, validation, OAuth, deterministic calculations
        |                    |
        v                    v
YouTube Data API v3       OpenAI Responses API
public data + owner        GPT-5.4 structured interpretation
caption endpoints
```

### Browser-visible code

`public/` contains HTML, CSS and React sources that are visible to users.

| Area | Purpose |
| --- | --- |
| `public/VideoDashboard.html` | Video analysis entry page; uses no-cache metadata and versioned client assets. |
| `public/ChannelDashbaord.html` | Channel dashboard entry page. The misspelling is retained for compatibility. |
| `public/client/VideoDashboard.jsx` | URL form, OAuth connection status, Phase 1 scorecard, Phase 2 score rings/timeline, GPT insight cards and sanity display. |
| `public/client/ChannelDashboard.jsx` | Channel analysis UI. |
| `public/styles/dashboard.css` | Responsive dashboard styles, compact details and hoverable charts/tooltips. |
| `public/assets/` | Generated bundles. They are rebuilt by `npm run build` and are intentionally ignored by Git. |

### Server-only code

`src/` must remain server-only. Never expose API keys, OAuth client secrets,
refresh tokens, prompts containing raw captions, or session data to `public/`.

| Area | Purpose |
| --- | --- |
| `src/server.js` | Application entry point; creates service clients and starts Express. |
| `src/app.js` | HTTP routes, rate limits, static hosting, signed-cookie helpers and OAuth endpoints. |
| `src/config.js` | Loads root `.env`, validates configured values and creates non-secret health status. |
| `src/services/youtubeDataClient.js` | Official public YouTube API calls, comment sampling and channel catalogue retrieval. |
| `src/services/openAIAnalysisClient.js` | OpenAI Responses API wrapper, strict JSON parsing/local validation and usage extraction. |
| `src/services/videoInsightAnalyst.js` | Bounded Phase 1/2 GPT request and economy-budget controls. |
| `src/services/googleOAuthService.js` | Google OAuth 2.0 authorisation, PKCE, token exchange/refresh, in-memory sessions and channel ownership lookup. |
| `src/services/youtubeCaptionService.js` | Owner-authorised caption discovery/download, WebVTT parsing and `Unknown` fallback. |
| `src/analysis/` | Video/channel orchestration, deterministic metrics, schemas and sanity checks. |

## Public analysis: Phase 1

`POST /api/video-analysis` accepts a YouTube video URL and a bounded comment
limit. The server:

1. Validates and extracts the video ID.
2. Retrieves public video metadata/statistics, category information and the
   best available thumbnail.
3. Retrieves channel catalogue data to calculate current lifetime ranks.
4. Samples top, recent and highly liked comments, with bounded reply handling.
5. Calculates deterministic metrics locally:
   - views per day;
   - likes per 100 views;
   - comments per 100 views;
   - current lifetime view/comment standing within the public channel catalogue.
6. Sends bounded descriptive metadata, selected comments and optionally the
   thumbnail to OpenAI for structured interpretation.
7. Locally validates the structured response and runs final sanity checks
   before returning browser-safe output.

The application deliberately does not send view, like or comment totals to the
video insight prompt. Rankings and numeric calculations are deterministic.

Public analysis is available for public videos without Google OAuth. It does
not provide private creator metrics such as impressions, click-through rate,
audience retention or watch time.

## Owner-authorised analysis: Phase 2

Phase 2 is intentionally narrower than "watching" or downloading a YouTube
video. The YouTube Data API does not expose arbitrary video/audio binaries to
this application. The current implementation uses owner-authorised caption
tracks only.

### OAuth and ownership flow

```text
Dashboard -> /auth/google/start
  -> Google authorisation with PKCE + state
  -> /auth/google/callback
  -> server stores tokens in memory
  -> signed HttpOnly session cookie in browser
  -> channels.list(mine=true) verifies owned channels
  -> captions.list + captions.download for a matching video channel
```

The only OAuth scope requested is:

```text
https://www.googleapis.com/auth/youtube.force-ssl
```

The server requires that the signed-in account owns or manages the video
channel returned by `channels.list?mine=true`. If there is no login, the login
expired, the account does not own that channel, captions are unavailable, or
YouTube denies the download, the owner-dependent result is safely represented
as `Unknown`. Phase 1 still completes.

The browser never receives access tokens, refresh tokens or caption text. It
receives only caption availability/source metadata and the bounded analysis.

### Current Phase 2 output

When an owner caption track is available, the server creates a compact
transcript analysis containing:

- hook, clarity, structure and pacing scores (0–100);
- a summary;
- a small hoverable evidence timeline;
- strongest and weakest timestamped moments; and
- explicit `Unknown` visual/audio evidence, because the app has not obtained
  video frames or audio.

The browser does not receive the raw transcript.

## OpenAI analysis modes and limits

Video analysis accepts `analysisMode: "economy"` or `"heavy"`. Each mode makes
one structured GPT request per analysis, with no automatic retry.

Current controls in `videoInsightAnalyst.js`:

| Control | Current value |
| --- | --- |
| Model | `gpt-5.4` by default (`OPENAI_VIDEO_MODEL` can override it) |
| Reasoning effort | `none` |
| Maximum output tokens | 1,800 economy / 3,000 heavy |
| Intended total ceiling | 5,000 economy / 10,000 heavy model tokens per video |
| Conservative estimated-input target | 3,000 economy / 6,000 heavy tokens |
| GPT comment threads | At most 8 economy / 18 heavy before budget trimming |
| Reply records per thread | At most 1 economy / 2 heavy |
| Caption excerpts | At most 12 economy / 24 heavy selected timestamped excerpts before budget trimming |
| Thumbnail detail | `low` economy / `high` heavy |
| Requests per video | 1 |

The implementation estimates input size, trims transcript/comment data before
calling OpenAI, limits output tokens, and rejects a response if OpenAI reports
more than the selected mode's total-token ceiling. OpenAI does not expose a request parameter that
hard-limits combined input plus output tokens, so this is a conservative
application-level budget rather than an absolute pre-billing guarantee. Do not
weaken it without adding an exact tokenizer/preflight strategy and tests.

The OpenAI response is required to match strict JSON Schema. Local validation
checks feedback categories, counts, allowed timestamps, score ranges and
caption-derived timestamps before the response is rendered.

## HTTP routes

| Route | Purpose | Authentication |
| --- | --- | --- |
| `GET /` | Redirects to Video Dashboard | None |
| `GET /api/health` | Non-secret configuration status | None |
| `GET /api/auth/status` | Non-secret owner-session status | Optional signed session cookie |
| `GET /auth/google/start` | Starts Google OAuth | None; fails with 503 if OAuth is not configured |
| `GET /auth/google/callback` | Handles Google callback and sets session cookie | OAuth state cookie required |
| `POST /api/auth/logout` | Revokes/removes local owner session | Optional signed session cookie; same-origin check |
| `POST /api/video-analysis` | Public video/owner-caption analysis | Optional signed session cookie |
| `POST /api/channel-analysis` | Channel top-ten/ranking analysis | None |

`/api` is rate-limited to 30 requests/minute. `/auth` is rate-limited to 20
requests/minute. These are single-instance in-memory limits, not distributed
limits.

## Environment variables

Copy `.env.example` to a root `.env` for local use. `.env` is ignored by Git.
Never put live values in `.env.example`, source code, browser JavaScript,
screenshots, GitHub secrets visible in logs, or documentation.

| Variable | Required locally for | Notes |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | Public video/channel analysis | Restrict it to YouTube Data API v3. |
| `OPENAI_API_KEY` | GPT analysis | Kept server-side only. |
| `OPENAI_VIDEO_MODEL` | Video GPT model selection | Default: `gpt-5.4`. |
| `OPENAI_CHANNEL_MODEL` | Channel GPT model selection | Default: `gpt-5.4`. |
| `GOOGLE_OAUTH_CLIENT_ID` | Optional owner sign-in | Google Web application client ID. Not a secret, but keep server-side. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Optional owner sign-in | Secret. |
| `GOOGLE_OAUTH_REDIRECT_URI` | Optional owner sign-in | Local: `http://localhost:3000/auth/google/callback`. |
| `SESSION_SECRET` | Signed session cookies | Use a new random value of at least 32 characters; 64 hex characters is recommended. |
| `PORT` | Node listener | Default: `3000`. |

Generate a local session secret without printing it to screen:

```powershell
$localSessionSecret = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$localSessionSecret.Length
$localSessionSecret | Set-Clipboard
```

Paste the clipboard value into `.env`, then remove the PowerShell variable if
desired:

```powershell
Remove-Variable localSessionSecret
```

## Local development and test procedure

Prerequisites:

- Node.js 20 or newer;
- YouTube Data API v3 enabled in the Google Cloud project;
- an OpenAI API key;
- for Phase 2, a Google OAuth Web client, the exact localhost redirect URI,
  the `youtube.force-ssl` scope, and the channel-owner Google account listed as
  a Test user while the OAuth app is in Testing.

Install and run:

```powershell
npm install
npm start
```

Open only this hostname for OAuth testing:

```text
http://localhost:3000/VideoDashboard.html
```

Do not substitute `127.0.0.1`: the OAuth callback and state cookie are bound
to `localhost`.

Useful local checks:

```text
http://localhost:3000/api/health
http://localhost:3000/api/auth/status
```

Expected before OAuth login:

```json
{
  "ownerAuth": {
    "configured": true,
    "connected": false,
    "channels": []
  }
}
```

After selecting **Connect Google**, use the exact account listed as a Google
OAuth Test user. A successful login returns to the dashboard with a signed
cookie. Restarting the Node process clears the current implementation's
in-memory sessions, so login must be repeated.

Run offline tests and a production client build:

```powershell
npm test
npm run build
```

The tests mock YouTube, Google OAuth and OpenAI. They use no live API quota or
model tokens. The suite currently covers OAuth state/PKCE, cookie hand-off,
owner checks, WebVTT parsing, economy controls, schemas, route behavior and
public data services.

## Google OAuth setup and publishing path

### Development / Testing state

Create a Google OAuth **Web application** client in the same Google Cloud
project that enables YouTube Data API v3.

Development configuration:

```text
Client name: any descriptive internal name, e.g. YouTube Analyser Web
Authorised redirect URI: http://localhost:3000/auth/google/callback
Authorised JavaScript origins: none required
Audience: External
Publishing status: Testing
Scope: https://www.googleapis.com/auth/youtube.force-ssl
Test users: each Google account allowed to sign in during testing
```

Test users are accounts, not channels. Public Phase 1 works for any public
video. Owner-only captions work only when the signed-in Test user owns/manages
the analysed video's channel. A Test user can own multiple channels.

### Before publishing OAuth to production

Do not switch to production until all of the following are done:

1. A stable HTTPS deployment exists with a real, exact redirect URI.
2. The production redirect URI is added to the same Google OAuth client, for
   example `https://example.com/auth/google/callback`.
3. The app has final branding, a support email, verified authorised domains,
   homepage, privacy policy and terms URLs as required by Google.
4. The required `youtube.force-ssl` scope is reviewed in Google Auth Platform.
   It accesses private YouTube data and can trigger Google verification
   requirements for external production users.
5. The consent screen accurately explains why the application uses the scope:
   owner confirmation and authorised caption retrieval for the creator's own
   channel.
6. Test accounts and test videos demonstrate the complete OAuth/caption flow.
7. A process exists for user support, privacy requests, consent revocation and
   incident response.

Before expanding beyond personal/testing use, review current Google OAuth and
YouTube API policy requirements rather than relying only on this document.

## Hosting and production-readiness checklist

### What is not ready today

- No hosting environment has been provisioned for this project.
- No image build is configured.
- No Dockerfile or `.dockerignore` exists.
- No deployment workflow is in `.github/workflows/`.
- OAuth sessions and token records are process-local memory, so they vanish on
  restart and do not work reliably across multiple replicas.
- No production secret store, central session store, observability policy or
  backup/retention policy is configured.

### Required work before hosting

1. **Choose hosting.** Azure Container Apps is a reasonable fit for this Node
   app because it supports a single container, HTTPS ingress, revisions and
   scale-to-zero. Do not reuse an unrelated application's Container App.
2. **Containerise the app.** Add a multi-stage Dockerfile that builds React,
   installs production dependencies, starts `node src/server.js`, excludes
   `.env`, and exposes port 3000. Test the image locally before deployment.
3. **Provision an isolated application.** Use a dedicated resource group and
   Container App/application URL. The new project must not share another
   project's environment variables or secrets.
4. **Set ingress and scaling.** Use HTTPS external ingress with target port
   3000. For small personal use, start with minimum replicas 0 and a low maximum
   (such as 1) after considering concurrency/cold-start trade-offs.
5. **Use a proper secret store.** Store YouTube/OpenAI/OAuth client secrets and
   session-signing secret in a host secret service. For Azure, use Container
   App secrets initially and prefer Key Vault references with managed identity
   for production.
6. **Replace in-memory OAuth state/session storage.** Persist pending OAuth
   state and encrypted token/session records in a shared secure store (for
   example Redis plus encrypted-at-rest database/Key Vault-backed token
   handling). This is required before multiple replicas, restarts or rolling
   deployments are reliable. Do not simply serialize tokens into browser
   cookies.
7. **Define token encryption and rotation.** Encrypt refresh tokens at rest,
   define key rotation, revoke tokens on logout/deletion, and expire sessions.
8. **Deploy only after CI.** Keep tests/build as a mandatory gate. Add a
   separate deploy workflow that builds an immutable image tagged by Git commit,
   pushes it to a registry, deploys a new revision, waits for a health check,
   and only then routes production traffic.
9. **Use least-privilege cloud identity.** Prefer GitHub OIDC/federated Azure
   credentials rather than a long-lived Azure client secret in GitHub. Give the
   deployment identity only the registry/app permissions it needs.
10. **Add production observability.** Structured logs without secrets, error
    monitoring, request IDs, uptime/health monitoring, alerts and a documented
    rollback procedure are required.
11. **Add security hardening.** Configure a content-security policy suitable
    for the dashboard, secure HTTPS cookies, trusted proxy settings where
    needed, central/distributed rate limiting, abuse limits, and dependency
    updates/scanning.
12. **Review data and privacy.** Define data retention for captions, comment
    snippets, logs and analysis outputs. Current code does not persist them,
    but production monitoring/caching may. Publish a privacy notice before
    accepting external users.

### Recommended deployment shape

```text
GitHub main push
  -> CI: npm ci, npm test, npm run build
  -> build immutable container image tagged with commit SHA
  -> push image to private registry
  -> deploy new Container App revision
  -> health-check /api/health
  -> route traffic to verified revision
  -> retain a limited rollback revision/image set
```

Keep deployment credentials, API keys and OAuth secrets out of GitHub source.
GitHub Actions needs only deployment identity configuration, not application
secrets, if the host injects them at runtime.

### Cost considerations

- Local development has no Azure hosting cost.
- Each real video analysis uses YouTube API quota and one bounded OpenAI request.
- On a consumption-based host that scales to zero, there is no running-app
  usage while zero replicas are active, but registries, stored images, logging,
  egress and build services can still incur charges.
- New deployments create revisions/images; inactive revisions may have no
  compute charge but should still be pruned according to the host/registry
  retention policy.
- Set explicit OpenAI organisation/project spend limits and monitor usage in
  addition to the in-app economy controls.

## Operational limitations and future work

1. **No arbitrary video/audio download.** Do not introduce `yt-dlp` or scraping
   to bypass YouTube API restrictions. Add creator-uploaded source media only
   after legal/privacy/product review.
2. **No YouTube Analytics API integration.** Creator private metrics, retention,
   impressions and click-through analysis are not implemented. They require a
   separate authorised YouTube Analytics design and permissions review.
3. **No cross-user persistence.** There is no database for users or analyses.
4. **Phase 2 is caption evidence, not retention evidence.** Scores are model
   observations over selected transcript excerpts; they are not audience
   retention measurements or proof of causality.
5. **Current channel analysis is separate.** It reports public top-ten videos
   by views/comments and a bounded GPT pattern summary. It is not an agent
   orchestration system.
6. **Future agents should remain bounded.** Deterministic API collection,
   arithmetic, rank calculations and validation should stay deterministic. Use
   agents/models for structured interpretation with tool limits, schema
   validation, logging and budget controls.

## Troubleshooting reference

| Symptom | Likely cause | First check |
| --- | --- | --- |
| `/api/health` has `googleOAuthConfigured: false` | Missing/placeholder OAuth env value or short session secret | Root `.env`, then restart server |
| Google `redirect_uri_mismatch` | URI differs by host, scheme, port or trailing slash | Google Client redirect list and `GOOGLE_OAUTH_REDIRECT_URI` |
| OAuth callback returns to `?owner=error` | State cookie missing/expired, wrong host, bad Google client config | Use `http://localhost:3000`, not `127.0.0.1`; restart and retry promptly |
| Google says access blocked in Testing | Account is not a Test user | Google Auth Platform → Audience |
| OAuth works but transcript is `Unknown` | Account does not own channel, no downloadable caption track, or permission denied | Test a video from the signed-in owner channel with captions |
| Video analysis fails with configuration error | YouTube/OpenAI keys missing | `/api/health` and root `.env` |
| Video analysis fails budget check | Input cannot be sufficiently trimmed or provider reports excessive usage | Keep comments/captions bounded; inspect non-secret logs |
| Browser displays an old dashboard | Cached browser asset | HTML/static server sets no-cache; hard-refresh and verify current asset version |
| CI fails | Test/build regression | Open failing GitHub Actions step; run `npm test` and `npm run build` locally |

## Key external references

- [YouTube Data API overview](https://developers.google.com/youtube/v3)
- [YouTube captions download endpoint](https://developers.google.com/youtube/v3/docs/captions/download)
- [Google OAuth for web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OAuth consent-screen publishing guidance](https://support.google.com/cloud/answer/13461325)
- [OpenAI Responses API documentation](https://platform.openai.com/docs/api-reference/responses)
- [Azure Container Apps deployment with GitHub Actions](https://learn.microsoft.com/azure/container-apps/github-actions)
- [Azure Container Apps secrets](https://learn.microsoft.com/azure/container-apps/manage-secrets)
