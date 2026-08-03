# Phase 1 Channel Dashboard implementation

This change implements public whole-channel intelligence while retaining the
existing YouTube data collector and one-request token ceilings. It does not add
owner-only YouTube Analytics; that remains Phase 2.

## New modules

| File | Responsibility |
|---|---|
| `src/analysis/analysisProfiles.js` | Shared Economy and Heavy profiles used by video and channel analysis. |
| `src/analysis/channelMetrics.js` | Complete-catalogue deterministic metrics, percentiles, cohorts, momentum, cadence, concentration, and outliers. |
| `src/analysis/selectChannelEvidence.js` | Deterministic selection of at most 12 Economy or 24 Heavy representative uploads. |
| `src/analysis/channelInsightSchema.js` | Strict channel JSON schema plus local evidence-ID validation. |
| `src/analysis/normaliseChannelInsight.js` | Normalisation before semantic validation. |
| `src/auth/sessionCookies.js` | Reusable signed owner-session cookie functions. |
| `src/routes/googleAuthRoutes.js` | Reusable OAuth status, start, callback, and logout routes with safe dashboard return paths. |

## Modified modules

| File | Change |
|---|---|
| `src/analysis/analyseChannel.js` | Orchestrates metrics, evidence selection, structured AI, client-safe catalogue data, and sanity checks. |
| `src/services/channelPerformanceAnalyst.js` | Uses strict structured output, shared profiles, full quota reservation, evidence validation, and graceful AI fallback. |
| `src/services/videoInsightAnalyst.js` | Imports the shared analysis profiles; its existing behaviour is unchanged. |
| `src/analysis/sanity.js` | Validates catalogue coverage, bounded percentiles, AI evidence IDs, fallback state, and token ceilings. |
| `src/app.js` | Delegates OAuth routes and passes `analysisMode` plus the signed owner session into channel requests. |
| `public/client/sharedDashboard.jsx` | Shares the daily quota warning and OAuth control across both dashboards. |
| `public/client/ChannelDashboard.jsx` | Adds modes, quota state, OAuth state, health/cohort/outlier views, structured AI findings, and the sortable catalogue. |
| `public/client/VideoDashboard.jsx` | Reuses the shared OAuth and quota components. |
| `public/styles/dashboard.css` | Styles the new Phase 1 channel components and responsive layouts. |
| `.env.example` | Uses the exact production callback URL for YouTube Signal Lab. |

## API request

`POST /api/channel-analysis` now accepts:

```json
{
  "url": "https://www.youtube.com/@channel",
  "analysisMode": "economy"
}
```

`analysisMode` is `economy` or `heavy`; omission defaults to `economy`. The
owner session remains in the signed HttpOnly cookie and is never accepted from
browser JSON.

## Local implementation and verification

1. Apply all files in this change on one branch.
2. Create `.env` from `.env.example`; do not commit `.env`.
3. Run:

   ```powershell
   npm ci
   npm run build
   npm test
   npm start
   ```

4. Open `http://localhost:3000/ChannelDashbaord.html` and test Economy and
   Heavy modes against a small and a large public channel.
5. Confirm Google login started on the Channel Dashboard returns to
   `ChannelDashbaord.html`, not the Video Dashboard.

Generated files in `public/assets/` are intentionally ignored and are rebuilt
by `npm run build`, Docker, and the GitHub deployment workflow.

## Production deployment

Before merging, set the GitHub production secret `GOOGLE_OAUTH_REDIRECT_URI`
to exactly:

```text
https://adam-youtube-signal-lab-2026.wittybay-03ca85b1.uksouth.azurecontainerapps.io/auth/google/callback
```

The same exact URI must be present in Google Cloud Console under the OAuth Web
client's **Authorised redirect URIs**. A push to `main` runs
`.github/workflows/deploy.yml`, which installs, builds, tests, publishes the
image, deploys a new Azure Container Apps revision, and verifies `/api/health`.

## Phase boundary

The public Data API cannot reliably identify every Short or provide retention,
watch time, shares, subscriber conversion, or current-period velocity. The UI
therefore says **up to 3 minutes**, treats views/day as a lifetime average, and
does not label either value as exact Shorts classification or current velocity.
