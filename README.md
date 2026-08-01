# YouTube Signal Lab

For a complete technical handover covering the current architecture, local
OAuth testing, production OAuth publishing, and hosting prerequisites, see
[docs/WEBAPP_HANDOVER.md](docs/WEBAPP_HANDOVER.md).

This repository now contains two implementations:

- `AgentTests/` is the original Python and `yt-dlp` command-line prototype.
- The repository root is a React and Node.js web application that uses the
  official YouTube Data API v3.

The web application has two analysis workflows. The video dashboard accepts a
YouTube video URL and displays:

- video title, channel, ID, publication date, tags, category, duration,
  caption availability, definition, and the best available thumbnail;
- lifetime view, like, and reported comment totals plus deterministic
  views-per-day, likes-per-100-views, and comments-per-100-views calculations;
- lifetime view and comment ranks within the channel's public upload catalogue;
- bounded top, recent, and highly liked comment samples, with complete replies
  retrieved for a limited set of materially useful threads;
- a strict GPT-5.4 title, thumbnail, and tag assessment with compact audience
  classifications;
- optional channel-owner Google sign-in for authorised caption retrieval,
  transcript-based hook, clarity, structure, pacing, and timeline analysis;
- economy and Heavy Analysis profiles, capped at 5,000 and 10,000 model tokens
  per video respectively; and
- a final sanity check covering identifiers, metadata, calculations, and the
  structured AI response.

The channel dashboard accepts an `@handle`, `/channel/ID`, or legacy `/user/`
URL and displays:

- channel-level subscriber, view, and public-video totals;
- the top 10 public uploads by lifetime view count;
- the top 10 public uploads by lifetime comment count;
- numerical view, comment, and like totals for each ranked video;
- a GPT-5.4 analysis of recurring characteristics in the two rankings; and
- a deterministic sanity check that verifies both rankings.

GPT-5.4 receives only bounded public metadata and statistics for the ranked
videos. It explains associations rather than deciding the rankings, and the
application does not claim access to private metrics such as impressions,
click-through rate, audience retention, or watch time.

## Project structure

```text
public/
  VideoDashboard.html          React video-analysis page
  ChannelDashbaord.html        React channel-analysis page
  client/                      Browser-side React source
  styles/                      Browser-side presentation
src/
  analysis/                    Server-side orchestration and sanity checks
  domain/                      URL and input validation
  services/                    YouTube and OpenAI API clients
  app.js                       Express routes and static-page serving
  server.js                    Node.js application entry point
test/                          Offline tests with mocked external APIs
```

Everything inside `public/` is client-visible. API keys, external API calls,
prompt construction, validation, and analysis remain inside `src/`.

## Obtain a YouTube API key

The application reads public YouTube data, so it needs an API key but does not
need YouTube OAuth access.

1. Sign in to the [Google Cloud Console](https://console.cloud.google.com/).
2. Use the project selector at the top to create a project, or select an
   existing project dedicated to this application.
3. Open **APIs & Services → Library**.
4. Search for **YouTube Data API v3**, open it, and select **Enable**.
5. Open **APIs & Services → Credentials**.
6. Select **Create credentials → API key**.
7. Copy the generated key.
8. Edit the key and set **API restrictions** to **Restrict key**, then select
   **YouTube Data API v3**.
9. For local development, an application restriction can be left unset. For a
   deployed server with a stable outbound IP, restrict the key to that IP.
   Do not use a website/referrer restriction: requests are made by Node.js, not
   directly by the browser.
10. Open the root `.env` and replace:

```dotenv
YOUTUBE_API_KEY=replace_with_your_youtube_api_key
```

Google's current setup references are:

- [YouTube Data API getting started](https://developers.google.com/youtube/v3/getting-started)
- [Enable an API](https://support.google.com/googleapi/answer/6158841)
- [Create and restrict an API key](https://support.google.com/googleapi/answer/6158862)

## Configure optional channel-owner Google OAuth

Public Phase 1 analysis does not require a Google login. Phase 2 caption
analysis is only attempted when the signed-in Google account owns the video's
channel. Without a login, or when the account owns a different channel, every
affected field is returned as **Unknown** and Phase 1 still runs.

1. In the same Google Cloud project, open **APIs & Services → OAuth consent
   screen** and configure the app. While its publishing status is **Testing**,
   add the Google accounts that will sign in as test users.
2. Open **APIs & Services → Credentials**, choose **Create credentials → OAuth
   client ID**, and select **Web application**.
3. Add this exact authorised redirect URI for local development:

```text
http://localhost:3000/auth/google/callback
```

4. Copy the client ID and client secret into the root `.env`. Generate a
   separate random session-signing secret of at least 32 characters:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

```dotenv
GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id_here
GOOGLE_OAUTH_CLIENT_SECRET=your_google_oauth_client_secret_here
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
SESSION_SECRET=paste_the_generated_random_value_here
```

The flow uses state validation, PKCE, an HttpOnly signed session cookie, a
four-hour server-side session, and the narrow
`youtube.force-ssl` scope. Google tokens never enter browser JavaScript or an
API response. Sessions are intentionally held in memory for this local app, so
restarting the server requires signing in again. A multi-instance production
deployment should replace this with an encrypted shared session store and use
an HTTPS redirect URI.

YouTube's caption download endpoint permits authorised users with permission to
edit the video. The server also verifies the signed-in account's owned channel
ID before requesting the track. The YouTube Data API does not provide the video
or audio binary, so visual/audio-only Phase 2 findings remain **Unknown** rather
than being invented.

## Configure OpenAI

Add the existing OpenAI API key to the same root `.env`:

```dotenv
OPENAI_API_KEY=replace_with_your_openai_api_key
OPENAI_ADMIN_KEY=optional_openai_organisation_admin_key
OPENAI_VIDEO_MODEL=gpt-5.4
OPENAI_CHANNEL_MODEL=gpt-5.4
```

Both keys remain on the Node server and are never returned to the browser.
The `.env` file is ignored by Git.

The dashboard warns at 150,000 tokens used in a UTC day and blocks a request
that would take usage beyond 200,000 tokens; it unlocks at 00:00 UTC. Without
`OPENAI_ADMIN_KEY`, the server enforces this for requests made by this running
application. Set an Organisation Admin key in production to also read the
OpenAI Usage API's organisation-wide, current-day total.

Video analysis uses one GPT request with no reasoning-token allocation. Economy
mode uses a low-detail thumbnail, up to eight comment threads and 12 caption
excerpts, with a 5,000-token ceiling. Heavy Analysis uses a high-detail
thumbnail, up to 18 threads, two replies per thread and 24 caption excerpts,
with a 10,000-token ceiling. Both profiles preflight-trim inputs and validate
reported usage.

## Install and run

Node.js 20 or newer is required.

```powershell
npm install
npm start
```

Then open:

```text
http://localhost:3000/VideoDashboard.html
http://localhost:3000/ChannelDashbaord.html
```

On Windows, `RunALL.cmd` installs dependencies if necessary, builds the React
client, and starts the server:

```powershell
.\RunALL.cmd
```

## Tests

The tests mock YouTube, Google OAuth, and OpenAI, so they do not require keys,
do not perform sign-in, and do not consume API quota or tokens:

```powershell
npm test
npm run build
```

The dashboard and `/api/health` can also start with placeholder keys. An actual
analysis request returns a clear setup message until both keys are configured.

## Continuous integration

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on every push
and pull request. It installs the locked dependency versions with `npm ci`,
runs the complete offline test suite, and verifies that both React dashboards
produce a successful production build. API secrets are not required by CI.

## API usage

The server uses:

- `channels.list` to resolve a channel and its uploads playlist;
- `playlistItems.list` to page through public uploads;
- batched `videos.list` calls for official video metadata and public
  statistics;
- `videoCategories.list` to translate category IDs;
- `commentThreads.list` for bounded top, recent, and highly liked top-level
  comment candidates;
- `comments.list` to complete a bounded set of reply threads; and
- owner-authorised `captions.list` and `captions.download` calls for Phase 2;
- `channels.list?mine=true` to verify the signed-in account owns the channel;
- the OpenAI Responses API with a strict JSON schema for video packaging and
  audience interpretation, plus channel pattern analysis.

Comments are treated as untrusted quoted data. They are not rendered back to
the browser, and any instructions contained within them are explicitly ignored
by the analysis prompt. The GPT-5.4 video request receives bounded comments,
public descriptive metadata, and the highest-resolution thumbnail, but it does
not receive view, like, or comment totals. All numerical metrics and rankings
are calculated locally.

YouTube offers relevance and recency ordering for comment threads, but not a
global likes sort. “Highly liked” therefore means the strongest like counts in
the bounded union of the retrieved relevance and recency candidates. Reply
completion is capped and its complete/truncated coverage is reported in the
response.

Channel catalogue results are cached in memory for 15 minutes. This reduces
repeat YouTube API calls while keeping the cache simple to replace with a
shared store if the application is deployed across multiple server instances.

The JSON endpoints are:

- `POST /api/video-analysis` with `{ "url": "...", "maxComments": 100 }`
- `POST /api/channel-analysis` with `{ "url": "..." }`
- `GET /api/health` for non-secret configuration readiness
- `GET /api/daily-token-usage` for the non-secret daily quota status
- `GET /api/auth/status` for non-secret owner-session status
- `GET /auth/google/start` and `GET /auth/google/callback` for Google OAuth
- `POST /api/auth/logout` to revoke and clear the local owner session

## TODO: comprehensive single-video analysis

Build the deeper analysis incrementally so that every conclusion remains tied
to observable evidence. Reports should clearly label findings as **observed**,
**inferred**, or **unknown**, and should not claim that correlation proves why
a video succeeded or failed.

### Phase 1: richer public-data analysis

- [x] Retrieve additional public metadata such as tags, category, duration,
  caption availability, and the highest-resolution thumbnail.
- [x] Calculate views per day, likes per 100 views, and comments per 100
  views.
- [ ] Compare the video with similar uploads from the same channel by age,
  duration, topic, and format.
- [ ] Report channel-relative percentiles instead of judging raw totals alone.
- [x] Report the video's lifetime view and comment ranks within the channel.
- [x] Sample top, recent, and highly liked comments and retrieve complete reply
  threads where they materially affect the analysis.
- [x] Classify audience feedback into praise, criticism, questions, confusion,
  requests, disagreement, timestamped reactions, and suspected spam,
  promotion, or off-topic responses.
- [x] Use GPT vision to assess title-and-thumbnail clarity, alignment, and
  possible packaging mismatch.

### Phase 2: transcript, audio, and visual analysis

- [x] Retrieve an owner-authorised YouTube caption track after channel
  ownership verification; otherwise report transcript-dependent fields as
  Unknown.
- [ ] Transcribe authorised audio and divide it into timestamped sections.
- [x] Produce bounded transcript-based hook, clarity, structure, pacing,
  strongest/weakest moment, and hoverable timeline signals.
- [ ] Identify repetition, digressions, unclear explanations, examples, calls
  to action, story structure, and potential Short-form clips.
- [ ] Extract selected frames at intervals, scene changes, and important
  transcript timestamps rather than sending the entire video to a model.
- [ ] Assess visual variety, on-screen text, demonstrations, editing rhythm,
  branding, and long static sections.
- [ ] Connect timestamped comments to the corresponding transcript and frames.

### Phase 3: creator-authorised YouTube Analytics

- [x] Add Google OAuth for channel owners without exposing refresh tokens to
  the browser.
- [ ] Retrieve supported private metrics such as average view duration,
  average percentage viewed, shares, playlist activity, and subscribers gained
  or lost.
- [ ] Retrieve audience-retention data and align spikes and drops with
  timestamped transcript and visual evidence.
- [ ] Include impressions and click-through information where the authorised
  YouTube Analytics reports support it.
- [ ] Separate packaging, retention, interaction, and conversion findings so a
  single score does not hide important trade-offs.

### Phase 4: agent orchestration and report quality

- [ ] Introduce a manager agent that calls bounded performance, packaging,
  transcript, visual, audience, and retention specialists as tools.
- [ ] Keep API collection, calculations, ranking, and validation deterministic;
  use agents for interpretation and evidence-based recommendations.
- [ ] Define structured output schemas containing the finding, supporting
  metric or timestamp, confidence, limitation, and recommended action.
- [ ] Add a verifier agent or deterministic guardrail that rejects unsupported
  causal claims, unavailable metrics, numerical contradictions, and
  overgeneralisation from small comment samples.
- [ ] Add tracing, token budgets, concurrency limits, retry limits, caching, and
  per-stage failure reporting.
- [ ] Produce a final creator report covering performance baseline, packaging,
  hook, structure, strongest and weakest moments, audience response,
  prioritised improvements, and confidence for every conclusion.
- [ ] Build representative evaluation fixtures and regression tests before
  allowing prompt or model changes into production.
