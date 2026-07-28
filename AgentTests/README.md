# YouTube Video Comment Analyser

This command-line tool accepts a YouTube video URL, retrieves its public view
count and a bounded sample of top-level comments, then asks OpenAI to summarise
the audience reaction.

It does not require a Google or YouTube API key. Public metadata and comments
are retrieved with `yt-dlp`; OpenAI is used only for the comment summary.

## Setup

From the `YoutubeChannelAnalyser\AgentTests` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Open `.env` and replace the placeholder:

```dotenv
OPENAI_API_KEY=replace_with_your_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
```

The `.env` file is excluded by `.gitignore`, so the API key will not be
committed.

The project uses the operating system certificate store, which also makes it
work on many Windows systems that route HTTPS through workplace or antivirus
software.

## Run

For an interactive run, launch `RunALL.cmd`:

```powershell
.\RunALL.cmd
```

The application begins by asking:

```text
Enter the YouTube video URL:
```

Paste the URL and press Enter. The launcher uses the local `.venv`
automatically.

You can alternatively pass the YouTube URL as a positional command-line
argument:

```powershell
python run.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

Change the maximum comment sample size if needed:

```powershell
python run.py "https://youtu.be/dQw4w9WgXcQ" --max-comments 200
```

The default is 100 comments. The resulting summary describes only the retrieved
sample, not necessarily every comment on the video.

At the end of every successful run, the CLI performs and displays a sanity
check confirming that:

- the extracted video ID matches the supplied URL;
- the view count is a non-negative integer;
- a video title was retrieved; and
- the comment summary is non-empty.

## Offline tests

The test suite does not call YouTube or OpenAI:

```powershell
python -m unittest discover -s tests -v
```

## Limitations

- Only public YouTube videos are supported.
- Age-restricted, private, region-blocked, or login-protected videos may fail.
- Videos with disabled comments return a clear “not enough data” summary.
- YouTube can change its public endpoints. Keep `yt-dlp` current if extraction
  begins failing: `python -m pip install --upgrade yt-dlp`.
