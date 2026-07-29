import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  ConfigurationNotice,
  ErrorNotice,
  Footer,
  formatDate,
  formatNumber,
  Header,
  SanityCard,
  summaryLines,
} from "./sharedDashboard.jsx";

function EmptyStage() {
  return (
    <section className="empty-stage channel-empty">
      <div className="channel-bars" aria-hidden="true">
        {[38, 65, 48, 88, 57, 100, 73, 46, 82, 61].map((height, index) => (
          <span key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
      <div>
        <p className="eyebrow">Channel-wide public signals</p>
        <h2>Find the uploads that set the pace.</h2>
        <p>
          The dashboard scans the channel’s public uploads, ranks them using
          YouTube’s reported totals, and asks GPT‑5.4 to explain recurring
          patterns in the strongest performers.
        </p>
        <ul className="feature-list">
          <li>Top 10 by lifetime views</li>
          <li>Top 10 by comment count</li>
          <li>Metadata-grounded pattern analysis</li>
          <li>Deterministic ranking sanity check</li>
        </ul>
      </div>
    </section>
  );
}

function LoadingStage() {
  return (
    <section className="loading-stage" aria-live="polite" aria-busy="true">
      <div className="analysis-orbit" aria-hidden="true">
        <span />
        <strong>10</strong>
      </div>
      <p className="eyebrow">Channel analysis in progress</p>
      <h2>Ranking the public catalogue…</h2>
      <p>
        Large channels take longer because the server must page through every
        public upload before comparing their statistics.
      </p>
      <div className="loading-steps" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function ChannelMetric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function RankingTable({ title, description, videos, emphasis }) {
  return (
    <article className="ranking-card">
      <div className="ranking-heading">
        <div>
          <p className="eyebrow">{emphasis}</p>
          <h2>{title}</h2>
        </div>
        <span className="sample-badge">{videos.length} videos</span>
      </div>
      <p className="ranking-description">{description}</p>
      <div className="table-scroll">
        <table className="ranking-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Video</th>
              <th scope="col">Published</th>
              <th scope="col">Views</th>
              <th scope="col">Comments</th>
              <th scope="col">Likes</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.videoId}>
                <td className="rank-number">{video.rank}</td>
                <th scope="row">
                  <a href={video.videoUrl} target="_blank" rel="noreferrer">
                    {video.title}
                  </a>
                </th>
                <td>{formatDate(video.publishedAt)}</td>
                <td>{formatNumber(video.viewCount)}</td>
                <td>{formatNumber(video.commentCount)}</td>
                <td>{formatNumber(video.likeCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ResultStage({ analysis }) {
  const insights = useMemo(
    () => summaryLines(analysis.performanceAnalysis),
    [analysis.performanceAnalysis],
  );

  return (
    <section className="result-stage channel-result">
      <article className="channel-overview-card">
        <div className="channel-identity">
          {analysis.channel.thumbnailUrl ? (
            <img src={analysis.channel.thumbnailUrl} alt="" />
          ) : (
            <span aria-hidden="true">YT</span>
          )}
          <div>
            <p className="eyebrow">Analysis complete</p>
            <h2>{analysis.channel.title}</h2>
            <a
              href={analysis.channel.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open channel on YouTube ↗
            </a>
          </div>
        </div>
        <div className="channel-metric-grid">
          <ChannelMetric
            label="Subscribers"
            value={analysis.channel.subscriberCount}
          />
          <ChannelMetric
            label="Channel views"
            value={analysis.channel.totalViewCount}
          />
          <ChannelMetric
            label="Public videos"
            value={analysis.channel.videoCount}
          />
          <ChannelMetric
            label="Videos analysed"
            value={analysis.channel.analysedVideoCount}
          />
        </div>
      </article>

      <div className="ranking-grid">
        <RankingTable
          title="Most viewed"
          description="Lifetime public view totals reported by YouTube."
          videos={analysis.topByViews}
          emphasis="Top 10 / reach"
        />
        <RankingTable
          title="Most commented"
          description="Lifetime public top-level and reply comment totals reported by YouTube."
          videos={analysis.topByComments}
          emphasis="Top 10 / interaction"
        />
      </div>

      <article className="summary-card channel-analysis-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GPT‑5.4 pattern analysis</p>
            <h2>What the strongest videos have in common</h2>
          </div>
          <span className="sample-badge">Public metadata only</span>
        </div>
        {insights.length > 1 ? (
          <ul className="summary-list">
            {insights.map((insight, index) => (
              <li key={`${index}-${insight.slice(0, 16)}`}>{insight}</li>
            ))}
          </ul>
        ) : (
          <p className="summary-paragraph">{analysis.performanceAnalysis}</p>
        )}
        <p className="analysis-caveat">
          These are associations in titles, descriptions, dates, duration, and
          public totals—not proof of causation. Private analytics such as
          impressions, click-through rate, retention, and watch time are not
          available here.
        </p>
      </article>

      <SanityCard sanity={analysis.sanity} />
    </section>
  );
}

function App() {
  const [url, setUrl] = useState("");
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
      const response = await fetch("/api/channel-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
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
      <Header activePage="channel" />
      <main>
        <section className="hero channel-hero">
          <div className="hero-copy">
            <p className="eyebrow">Channel intelligence / public data</p>
            <h1>
              Rank the uploads.
              <br />
              <em>Read the pattern.</em>
            </h1>
            <p>
              Compare a channel’s ten most-viewed and most-commented public
              videos, then identify the characteristics associated with strong
              reach and interaction.
            </p>
          </div>

          <form className="analysis-form" onSubmit={submit}>
            <label htmlFor="channel-url">YouTube channel URL</label>
            <div className="url-control">
              <span aria-hidden="true">▶</span>
              <input
                id="channel-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.youtube.com/@channel"
                autoComplete="url"
                required
              />
            </div>
            <div className="form-footer channel-form-footer">
              <button type="submit" disabled={loading}>
                {loading ? "Analysing channel…" : "Analyse channel"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <small>
              Supports @handle, /channel/ID, and legacy /user/ URLs. Results are
              cached briefly to reduce YouTube API usage.
            </small>
          </form>
        </section>

        <div className="content-shell">
          <ConfigurationNotice status={configuration} />
          <ErrorNotice message={error} />
          {loading ? (
            <LoadingStage />
          ) : analysis ? (
            <ResultStage analysis={analysis} />
          ) : (
            <EmptyStage />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
