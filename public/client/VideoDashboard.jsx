import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ConfigurationNotice,
  ErrorNotice,
  Footer,
  formatDate,
  formatNumber,
  Header,
  SanityCard,
} from "./sharedDashboard.jsx";

const feedbackLabels = {
  praise: "Praise",
  criticism: "Criticism",
  questions: "Questions",
  confusion: "Confusion",
  requests: "Requests",
  disagreement: "Disagreement",
  timestamped_reactions: "Timestamped reactions",
  suspected_spam_or_off_topic: "Suspected spam / off-topic",
};

function humanise(value) {
  return String(value ?? "Unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDuration(totalSeconds) {
  if (!Number.isInteger(totalSeconds) || totalSeconds < 0) return "Unavailable";
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [
    hours ? `${hours}h` : null,
    minutes ? `${minutes}m` : null,
    `${seconds}s`,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatRate(value, suffix = "") {
  return Number.isFinite(value) ? `${formatNumber(value)}${suffix}` : "—";
}

function formatRank(ranking) {
  return Number.isInteger(ranking?.rank) && Number.isInteger(ranking?.outOf)
    ? `#${formatNumber(ranking.rank)} of ${formatNumber(ranking.outOf)}`
    : "Unavailable";
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
          <li>Stratified comments and material replies</li>
          <li>GPT‑5.4 thumbnail and audience analysis</li>
          <li>Strict JSON validation and sanity checks</li>
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
        Retrieving public metadata, channel benchmarks, and comment threads,
        then validating the structured GPT‑5.4 analysis.
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

function FactRow({ label, value, note }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </td>
    </tr>
  );
}

function CompactMetric({ label, value, note, tooltip }) {
  return (
    <div
      className="compact-metric hover-help"
      data-tip={tooltip}
      tabIndex="0"
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function RankMeter({ label, ranking, noun }) {
  const available =
    Number.isInteger(ranking?.rank) &&
    Number.isInteger(ranking?.outOf) &&
    ranking.outOf > 0;
  const rawStanding =
    available && ranking.outOf === 1
      ? 100
      : available
        ? ((ranking.outOf - ranking.rank) / (ranking.outOf - 1)) * 100
        : 0;
  const standing = Math.max(0, Math.min(100, rawStanding));
  const topShare = available
    ? Math.max(1, Math.ceil((ranking.rank / ranking.outOf) * 100))
    : null;
  const description = available
    ? `${label}: ${formatRank(ranking)} by current lifetime ${noun}.`
    : `${label} is unavailable because no comparable public total was returned.`;

  return (
    <details
      className="rank-meter hover-help"
      data-tip={description}
    >
      <summary>
        <div className="rank-meter-heading">
          <span>{label}</span>
          <strong>{formatRank(ranking)}</strong>
        </div>
        <div
          className="rank-track"
          role="img"
          aria-label={description}
        >
          <span style={{ width: `${standing}%` }}></span>
          {available && <i style={{ left: `${standing}%` }}></i>}
        </div>
        <div className="rank-scale">
          <small>Lower</small>
          <b>{available ? `Top ${topShare}%` : "Unavailable"}</b>
          <small>Higher</small>
        </div>
      </summary>
      <p>
        Rank = 1 + the number of public channel uploads with a higher lifetime
        {` ${noun}`} total. Equal totals share a rank.
      </p>
    </details>
  );
}

function PhaseOneScorecard({ video, metrics }) {
  const firstDay = metrics.first24Hours;
  const live = firstDay.status === "live_snapshot";

  return (
    <article className="phase-one-card">
      <div className="compact-heading phase-one-heading">
        <div>
          <p className="eyebrow">Phase 1 / at a glance</p>
          <h2>Performance snapshot</h2>
        </div>
        <p>Hover for a definition. Click below for the calculation details.</p>
      </div>

      <div className="compact-metric-grid">
        <CompactMetric
          label="Daily reach"
          value={formatRate(metrics.viewsPerDay)}
          note="views / day"
          tooltip="Current lifetime views divided by the video's age in days."
        />
        <CompactMetric
          label="Like rate"
          value={formatRate(metrics.likesPer100Views)}
          note="per 100 views"
          tooltip="Current likes divided by current views, multiplied by 100."
        />
        <CompactMetric
          label="Comment rate"
          value={formatRate(metrics.commentsPer100Views)}
          note="per 100 views"
          tooltip="Current reported comments divided by current views, multiplied by 100."
        />
      </div>

      <div className="rank-overview">
        <RankMeter
          label="View standing"
          ranking={metrics.channelLifetimeRanking.views}
          noun="views"
        />
        <RankMeter
          label="Comment standing"
          ranking={metrics.channelLifetimeRanking.comments}
          noun="comments"
        />
      </div>

      <div className={`first-day-inline ${live ? "live" : ""}`}>
        <span>First 24 hours</span>
        <strong>
          {live
            ? `${formatNumber(firstDay.viewsObserved)} views · ${formatNumber(
                firstDay.commentsObserved,
              )} comments at ${formatRate(firstDay.observedAtAgeHours)}h`
            : "Historical comparison unavailable"}
        </strong>
        <p title={firstDay.explanation}>{firstDay.explanation}</p>
      </div>

      <details className="detail-drawer dark-drawer">
        <summary>
          <span>Calculations and public metadata</span>
          <small>Open details</small>
        </summary>
        <div className="drawer-grid">
          <section>
            <h3>How the figures are calculated</h3>
            <table className="fact-table">
              <tbody>
                <FactRow
                  label="Views per day"
                  value="views ÷ age in days"
                  note="A minimum age of one minute prevents division by zero."
                />
                <FactRow
                  label="Likes / 100"
                  value="likes ÷ views × 100"
                />
                <FactRow
                  label="Comments / 100"
                  value="comments ÷ views × 100"
                />
                <FactRow
                  label="Channel rank"
                  value="1 + videos with a higher total"
                  note="Equal totals receive the same rank."
                />
              </tbody>
            </table>
          </section>
          <section>
            <h3>Public video metadata</h3>
            <table className="fact-table">
              <tbody>
                <FactRow label="Category" value={video.category.title} />
                <FactRow label="Duration" value={formatDuration(video.durationSeconds)} />
                <FactRow
                  label="Captions"
                  value={video.captionsAvailable ? "Available" : "Not available"}
                />
                <FactRow
                  label="Thumbnail"
                  value={humanise(video.thumbnail?.quality ?? "unavailable")}
                  note={
                    video.thumbnail?.width && video.thumbnail?.height
                      ? `${video.thumbnail.width} × ${video.thumbnail.height}px`
                      : null
                  }
                />
              </tbody>
            </table>
            <div className="tag-section">
              <span>Tags</span>
              {video.tags.length ? (
                <div className="tag-list">
                  {video.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : (
                <p>No public tags were returned.</p>
              )}
            </div>
          </section>
        </div>
      </details>
    </article>
  );
}

function InsightDigest({ packaging, audience, sampling }) {
  const visibleFeedback = audience.feedbackRows
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count);

  return (
    <article className="insight-digest">
      <div className="compact-heading insight-digest-heading">
        <div>
          <p className="eyebrow">GPT‑5.4 interpretation</p>
          <h2>What stands out</h2>
        </div>
        <span className="sample-badge">
          {formatNumber(sampling.analysedByGpt)} threads
        </span>
      </div>

      <div className="digest-grid">
        <section>
          <span className="digest-label">Packaging</span>
          <div className="digest-badges">
            <b>Title: {humanise(packaging.titleClarity)}</b>
            <b>Thumbnail: {humanise(packaging.thumbnailClarity)}</b>
            <b>Mismatch: {humanise(packaging.contentMismatchRisk)}</b>
          </div>
          <p>{packaging.observation}</p>
        </section>
        <section>
          <span className="digest-label">Audience</span>
          <strong className="sentiment-pill">
            {humanise(audience.overallSentiment)}
          </strong>
          <p>{audience.executiveSummary}</p>
          <div className="feedback-pills">
            {visibleFeedback.length ? (
              visibleFeedback.map((row) => (
                <span
                  key={row.category}
                  title={row.observation}
                >
                  {feedbackLabels[row.category]} {formatNumber(row.count)}
                </span>
              ))
            ) : (
              <span>No recurring feedback signals</span>
            )}
          </div>
        </section>
      </div>

      <details className="detail-drawer light-drawer">
        <summary>
          <span>AI evidence, classifications, and sample coverage</span>
          <small>Open details</small>
        </summary>
        <div className="insight-details">
          <section>
            <h3>Title and thumbnail assessment</h3>
            <div className="table-scroll light-table-scroll">
              <table className="insight-table">
                <thead>
                  <tr><th scope="col">Measure</th><th scope="col">Assessment</th></tr>
                </thead>
                <tbody>
                  <tr><th scope="row">Title clarity</th><td>{humanise(packaging.titleClarity)}</td></tr>
                  <tr><th scope="row">Thumbnail clarity</th><td>{humanise(packaging.thumbnailClarity)}</td></tr>
                  <tr><th scope="row">Title / thumbnail alignment</th><td>{humanise(packaging.titleThumbnailAlignment)}</td></tr>
                  <tr><th scope="row">Possible mismatch risk</th><td>{humanise(packaging.contentMismatchRisk)}</td></tr>
                </tbody>
              </table>
            </div>
            {packaging.evidence.length > 0 && (
              <ul className="evidence-list">
                {packaging.evidence.map((evidence) => (
                  <li key={evidence}>{evidence}</li>
                ))}
              </ul>
            )}
            <p className="analysis-caveat">{packaging.limitation}</p>
          </section>

          <section>
            <h3>Audience classifications</h3>
            <p className="table-note">
              Categories may overlap, so percentages do not need to total 100%.
            </p>
            <div className="table-scroll light-table-scroll">
              <table className="insight-table audience-table">
                <thead>
                  <tr>
                    <th scope="col">Feedback</th>
                    <th scope="col">Threads</th>
                    <th scope="col">Sample</th>
                    <th scope="col">Pattern</th>
                    <th scope="col">Confidence</th>
                    <th scope="col">Observation</th>
                  </tr>
                </thead>
                <tbody>
                  {audience.feedbackRows.map((row) => (
                    <tr key={row.category}>
                      <th scope="row">{feedbackLabels[row.category]}</th>
                      <td>{formatNumber(row.count)}</td>
                      <td>{formatRate(row.percentOfAnalysed, "%")}</td>
                      <td>{humanise(row.prevalence)}</td>
                      <td>{humanise(row.confidence)}</td>
                      <td>{row.observation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {audience.timestampedReactions.length > 0 && (
            <section>
              <h3>Timestamped reactions</h3>
              <div className="table-scroll light-table-scroll">
                <table className="insight-table timestamp-table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Sentiment</th>
                      <th scope="col">Threads</th>
                      <th scope="col">Observation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audience.timestampedReactions.map((reaction) => (
                      <tr key={`${reaction.seconds}-${reaction.observation}`}>
                        <th scope="row">{reaction.timestamp}</th>
                        <td>{humanise(reaction.sentiment)}</td>
                        <td>{formatNumber(reaction.commentCount)}</td>
                        <td>{reaction.observation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h3>Comment sample coverage</h3>
            <div className="coverage-grid">
              <span><b>{formatNumber(sampling.top)}</b>Top</span>
              <span><b>{formatNumber(sampling.recent)}</b>Recent</span>
              <span><b>{formatNumber(sampling.highlyLiked)}</b>Highly liked</span>
              <span><b>{formatNumber(sampling.sampledReplies)}</b>Replies</span>
              <span><b>{formatNumber(sampling.completeReplyThreads)}</b>Complete threads</span>
              <span><b>{formatNumber(sampling.truncatedReplyThreads)}</b>Truncated</span>
            </div>
            <p className="table-note">
              “Highly liked” is selected from the bounded top and recent
              candidate pool because YouTube has no global likes-sorted feed.
            </p>
            <ul className="limitation-list">
              {audience.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </section>
        </div>
      </details>
    </article>
  );
}

function ResultStage({ analysis }) {
  const { video, metrics, insights } = analysis;

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

      <PhaseOneScorecard video={video} metrics={metrics} />
      <InsightDigest
        packaging={insights.packaging}
        audience={insights.audience}
        sampling={video.commentSampling}
      />

      <SanityCard sanity={analysis.sanity} />
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
      <Header activePage="video" />
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
              evidence-led assessment of its packaging, performance, and public
              conversation.
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
              Stratified top, recent, and highly liked threads; maximum 500.
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
