# YouTube Signal Lab

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
- a clearly labelled live first-day snapshot for videos under 24 hours old, or
  an explanation that historical first-day totals are unavailable publicly;
- bounded top, recent, and highly liked comment samples, with complete replies
  retrieved for a limited set of materially useful threads;
- a strict GPT-5.4 title-and-thumbnail assessment and tabular audience
  classification; and
- a final sanity check covering identifiers, metadata, calculations,
  first-day limitations, and the structured AI response.

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

## Configure OpenAI

Add the existing OpenAI API key to the same root `.env`:

```dotenv
OPENAI_API_KEY=replace_with_your_openai_api_key
OPENAI_VIDEO_MODEL=gpt-5.4
OPENAI_CHANNEL_MODEL=gpt-5.4
```

Both keys remain on the Node server and are never returned to the browser.
The `.env` file is ignored by Git.

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

The tests mock YouTube and OpenAI, so they do not require either API key and do
not consume API quota or tokens:

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

The public YouTube Data API supplies current lifetime statistics rather than a
historical snapshot of each video's first 24 hours. Consequently, the
application never invents a first-day rank: it shows current totals while a
video is still under 24 hours old and reports the historical limitation
afterwards. Exact historical comparisons require snapshots collected by this
application over time or creator-authorised analytics.

Channel catalogue results are cached in memory for 15 minutes. This reduces
repeat YouTube API calls while keeping the cache simple to replace with a
shared store if the application is deployed across multiple server instances.

The JSON endpoints are:

- `POST /api/video-analysis` with `{ "url": "...", "maxComments": 100 }`
- `POST /api/channel-analysis` with `{ "url": "..." }`
- `GET /api/health` for non-secret configuration readiness

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
- [x] Report the video's lifetime view and comment ranks within the channel,
  while explicitly marking unavailable historical first-day ranks.
- [x] Sample top, recent, and highly liked comments and retrieve complete reply
  threads where they materially affect the analysis.
- [x] Classify audience feedback into praise, criticism, questions, confusion,
  requests, disagreement, timestamped reactions, and suspected spam,
  promotion, or off-topic responses.
- [x] Use GPT vision to assess title-and-thumbnail clarity, alignment, and
  possible packaging mismatch.

### Phase 2: transcript, audio, and visual analysis

- [ ] Accept a creator-provided transcript or an authorised source video/audio
  file; do not assume the public YouTube API provides arbitrary transcripts.
- [ ] Transcribe authorised audio and divide it into timestamped sections.
- [ ] Evaluate the opening 15, 30, and 60 seconds for promise delivery and time
  to first value.
- [ ] Identify repetition, digressions, unclear explanations, examples, calls
  to action, story structure, and potential Short-form clips.
- [ ] Extract selected frames at intervals, scene changes, and important
  transcript timestamps rather than sending the entire video to a model.
- [ ] Assess visual variety, on-screen text, demonstrations, editing rhythm,
  branding, and long static sections.
- [ ] Connect timestamped comments to the corresponding transcript and frames.

### Phase 3: creator-authorised YouTube Analytics

- [ ] Add Google OAuth for channel owners without exposing refresh tokens to
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
