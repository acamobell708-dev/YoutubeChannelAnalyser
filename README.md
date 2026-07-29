# YouTube Signal Lab

This repository now contains two implementations:

- `AgentTests/` is the original Python and `yt-dlp` command-line prototype.
- The repository root is a React and Node.js web application that uses the
  official YouTube Data API v3.

The web application accepts a YouTube video URL and displays the same core
information as the prototype:

- video title, channel, ID, publication date, and thumbnail;
- view, like, and reported comment counts;
- the number of top-level comments sampled;
- an OpenAI-generated summary of audience reaction; and
- a final sanity check confirming that the result is internally consistent.

## Project structure

```text
public/
  VideoDashboard.html          React video-analysis page
  ChannelDashbaord.html        Placeholder for channel analytics
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
OPENAI_MODEL=gpt-5.4-mini
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

## API usage

The server uses:

- `videos.list` for official video metadata and public statistics;
- `commentThreads.list` for bounded top-level public comment samples; and
- the OpenAI Responses API for the audience summary.

Comments are treated as untrusted quoted data. They are not rendered back to
the browser, and any instructions contained within them are explicitly ignored
by the summarisation prompt.
