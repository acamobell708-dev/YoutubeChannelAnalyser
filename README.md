# YouTube Signal Lab

React and Node.js dashboards for evidence-led YouTube video and channel analysis. The web app uses official YouTube APIs; `AgentTests/` is the older Python/`yt-dlp` prototype. For full architecture, OAuth publishing, and deployment guidance, see [WEBAPP_HANDOVER.md](docs/WEBAPP_HANDOVER.md).

## What it does

- **Video dashboard:** public metadata, locally calculated performance/rankings, bounded comment analysis, GPT packaging/audience interpretation, next-video guidance, and owner-authorised captions and Analytics.
- **Channel dashboard:** public channel totals, top public videos by views/comments, and a bounded GPT pattern summary.
- **Safety:** API keys/tokens stay server-side; comments are untrusted input; numeric metrics and rankings are deterministic; AI interpretation is validated and labelled separately from measured data.

## Retention behaviour

Owner sign-in can retrieve average view duration, average percentage viewed, watch time, and the raw audience-retention curve. It does not consume GPT tokens.

- **Absolute retention** is the percentage of views that watched a point in this video. It powers the line chart, intro retention, strongest section, dips, spikes, and timestamps.
- **Typical/relative retention** compares that point with YouTube videos of a similar length. It is optional: when available, the dashboard shows a 0–100 similar-length comparison and hover detail; when withheld, the absolute chart remains and the comparison is marked unavailable.

YouTube can expose aggregate owner metrics or a Studio chart while withholding one or more API report metrics. The app requests the essential curve separately from optional relative and granular metrics so missing comparisons do not prevent the chart rendering.

## Setup

Node.js 20+ is required.

```powershell
npm install
npm start
```

Open:

```text
http://localhost:3000/VideoDashboard.html
http://localhost:3000/ChannelDashbaord.html
```

`RunALL.cmd` performs the same local install/build/start workflow on Windows.

Create `.env` from the project example and configure the required keys:

```dotenv
YOUTUBE_API_KEY=...
OPENAI_API_KEY=...
OPENAI_VIDEO_MODEL=gpt-5.4
OPENAI_CHANNEL_MODEL=gpt-5.4
```

Enable **YouTube Data API v3** in Google Cloud and restrict the API key to that API. The key belongs on the Node server, never in browser code.

### Optional owner OAuth

To unlock captions and owner Analytics, create a Web OAuth client in the same Google Cloud project, enable **YouTube Analytics API**, and configure:

```dotenv
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
SESSION_SECRET=a_random_value_of_at_least_32_characters
```

The app requests `youtube.force-ssl`, `youtube.readonly`, and `yt-analytics.readonly`. OAuth sessions are held in memory locally, so restart the server and reconnect Google after changing scopes or restarting. Only a verified owner/manager can request creator-only data.

## Analysis limits

- **Economy:** one bounded GPT request, 6,500-token ceiling.
- **Heavy Analysis:** larger bounded inputs, 10,000-token ceiling.
- Daily usage warns at 150,000 tokens and blocks requests beyond 200,000 tokens (UTC day).
- The app does not download video/audio, infer unavailable visual/audio evidence, or claim GPT transcript signals are measured viewer retention.

## Tests and useful routes

```powershell
npm test
npm run build
```

Tests are offline/mocked and do not consume API quota or tokens.

- `POST /api/video-analysis`
- `POST /api/channel-analysis`
- `GET /api/health`
- `GET /api/daily-token-usage`
- `GET /api/auth/status`

## Roadmap

- **Phase 1 — public evidence:** complete channel-relative comparisons and percentiles.
- **Phase 2 — creator evidence:** add authorised audio/frame analysis only after a safe source-media design.
- **Phase 3 — owner Analytics:** extend authorised reports where YouTube exposes impressions and click-through metrics.
- **Phase 4 — quality controls:** add specialist orchestration, evaluation fixtures, and stronger evidence-verification controls.
