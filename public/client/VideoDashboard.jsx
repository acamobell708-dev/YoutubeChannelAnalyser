import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const numberFormatter = new Intl.NumberFormat("en-GB");
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatNumber(value) {
  return Number.isFinite(value) ? numberFormatter.format(value) : "—";
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : dateFormatter.format(date);
}

function summaryLines(summary) {
  return String(summary ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function Header() {
  return (
    <header className="site-header">
      <a
        className="brand"
        href="/VideoDashboard.html"
        aria-label="YouTube Signal Lab"
      >
        <span className="brand-mark" aria-hidden="true">
          ▶
        </span>
        <span>
          <strong>YT Signal</strong>
          <small>Audience intelligence</small>
        </span>
      </a>
      <nav className="primary-nav" aria-label="Primary navigation">
        <a
          className="active"
          href="/VideoDashboard.html"
          aria-current="page"
        >
          Video Dashboard
        </a>
        <a href="/ChannelDashbaord.html">
          Channel Dashboard
          <span className="soon-tag">Soon</span>
        </a>
      </nav>
    </header>
  );
}

function ConfigurationNotice({ status }) {
  if (!status || status.ready) return null;

  const missing = [];
  if (!status.youtubeApiConfigured) missing.push("YouTube API key");
  if (!status.openaiConfigured) missing.push("OpenAI API key");

  return (
    <aside className="configuration-notice" role="status">
      <span aria-hidden="true">!</span>
      <p>
        <strong>Setup required.</strong> Add your {missing.join(" and ")} to the
        server’s <code>.env</code> file before running an analysis.
      </p>
    </aside>
  );
}

function EmptyStage() {
  return (
    <section className="empty-stage" aria-label="What the dashboard analyses">
      <div className="empty-visual" aria-hidden="true">
        <div className="video-window">
          <span className="window-dot"></span>
          <span className="window-dot"></span>
          <span className="window-dot"></span>
          <div className="play-disc">▶</div>
        </div>
        <div className="signal-card signal-card-one">
          <span></span>
          <strong>1.2M</strong>
          <small>views</small>
        </div>
        <div className="signal-card signal-card-two">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div>
        <p className="eyebrow">One URL. A clearer audience signal.</p>
        <h2>Move beyond the view count.</h2>
        <p>
          The server securely retrieves official YouTube statistics, samples
          the most relevant public comments, and asks OpenAI to identify the
          themes worth paying attention to.
        </p>
        <ul className="feature-list">
          <li>Official public video statistics</li>
          <li>Bounded top-level comment sample</li>
          <li>Evidence-grounded audience summary</li>
          <li>Final result sanity check</li>
        </ul>
      </div>
    </section>
  );
}

function LoadingStage() {
  return (
    <section className="loading-stage" aria-live="polite" aria-busy="true">
      <div className="analysis-orbit" aria-hidden="true">
        <span></span>
        <strong>▶</strong>
      </div>
      <p className="eyebrow">Analysis in progress</p>
      <h2>Listening to the audience signal…</h2>
      <p>
        Retrieving official video statistics and comments, then preparing the
        summary.
      </p>
      <div className="loading-steps" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </section>
  );
}

function Metric({ label, value, annotation }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {annotation && <small>{annotation}</small>}
    </div>
  );
}

function ResultStage({ analysis }) {
  const video = analysis.video;
  const bullets = useMemo(
    () => summaryLines(analysis.commentSummary),
    [analysis.commentSummary],
  );

  return (
    <section className="result-stage">
      <article className="video-card">
        <div className="thumbnail-frame">
          {video.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt="" />
          ) : (
            <div className="thumbnail-fallback" aria-hidden="true">
              ▶
            </div>
          )}
          <a
            href={video.sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${video.title} on YouTube`}
          >
            Open on YouTube ↗
          </a>
        </div>
        <div className="video-copy">
          <p className="eyebrow">Analysis complete</p>
          <h2>{video.title}</h2>
          <p className="video-byline">
            {video.channel} <span>•</span> {formatDate(video.publishedAt)}
          </p>
          <div className="metric-grid">
            <Metric label="Views" value={formatNumber(video.viewCount)} />
            <Metric label="Likes" value={formatNumber(video.likeCount)} />
            <Metric
              label="Comments"
              value={formatNumber(video.reportedCommentCount)}
              annotation={`${formatNumber(video.sampledCommentCount)} sampled`}
            />
          </div>
        </div>
      </article>

      <article className="summary-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Audience readout</p>
            <h2>What viewers are saying</h2>
          </div>
          <span className="sample-badge">
            {formatNumber(video.sampledCommentCount)} comments
          </span>
        </div>
        {bullets.length > 1 ? (
          <ul className="summary-list">
            {bullets.map((bullet, index) => (
              <li key={`${index}-${bullet.slice(0, 16)}`}>{bullet}</li>
            ))}
          </ul>
        ) : (
          <p className="summary-paragraph">{analysis.commentSummary}</p>
        )}
      </article>

      <aside
        className={`sanity-card ${analysis.sanity.passed ? "passed" : "failed"}`}
      >
        <div className="sanity-icon" aria-hidden="true">
          {analysis.sanity.passed ? "✓" : "!"}
        </div>
        <div>
          <strong>
            Sanity check {analysis.sanity.passed ? "passed" : "failed"}
          </strong>
          <p>{analysis.sanity.checks.join(" · ")}</p>
        </div>
      </aside>
    </section>
  );
}

function App() {
  const [url, setUrl] = useState("");
  const [maxComments, setMaxComments] = useState(100);
  const [configuration, setConfiguration] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/health")
      .then((response) => response.json())
      .then((payload) => {
        if (active) setConfiguration(payload.configuration);
      })
      .catch(() => {
        if (active) {
          setError(
            "The dashboard could not reach its Node.js server. Start the application and refresh this page.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setAnalysis(null);
    setLoading(true);

    try {
      const response = await fetch("/api/video-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          maxComments: Number(maxComments),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "The analysis could not be completed.",
        );
      }

      setAnalysis(payload.analysis);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Video intelligence / public data</p>
            <h1>
              See the video.
              <br />
              <em>Hear the audience.</em>
            </h1>
            <p>
              Turn a YouTube URL into a reliable view-count report and a concise
              summary of the public conversation around it.
            </p>
          </div>

          <form className="analysis-form" onSubmit={submit}>
            <label htmlFor="video-url">YouTube video URL</label>
            <div className="url-control">
              <span aria-hidden="true">▶</span>
              <input
                id="video-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                autoComplete="url"
                required
              />
            </div>
            <div className="form-footer">
              <label className="comment-limit">
                <span>Comment sample</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={maxComments}
                  onChange={(event) => setMaxComments(event.target.value)}
                  aria-describedby="comment-help"
                />
              </label>
              <button type="submit" disabled={loading}>
                {loading ? "Analysing…" : "Analyse video"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <small id="comment-help">
              Top-level comments ordered by relevance; maximum 500.
            </small>
          </form>
        </section>

        <div className="content-shell">
          <ConfigurationNotice status={configuration} />
          {error && (
            <div className="error-notice" role="alert">
              <span aria-hidden="true">!</span>
              <div>
                <strong>Analysis stopped</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          {loading ? (
            <LoadingStage />
          ) : analysis ? (
            <ResultStage analysis={analysis} />
          ) : (
            <EmptyStage />
          )}
        </div>
      </main>

      <footer>
        <span>YT Signal</span>
        <p>
          Public YouTube data via YouTube Data API v3. Comment interpretation
          via OpenAI.
        </p>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
