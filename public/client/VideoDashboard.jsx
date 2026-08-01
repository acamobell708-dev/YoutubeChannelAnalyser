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

function formatTimestamp(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0) return "Unknown";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function DailyUsageNotice({ usage }) {
  if (!usage?.warning) return null;
  const used = formatNumber(usage.projectedTokens ?? usage.usedTokens);
  const limit = formatNumber(usage.limit);
  return (
    <div className={`daily-usage-notice ${usage.locked ? "locked" : ""}`} role="status">
      <strong>{usage.locked ? "Daily analysis limit reached" : "Daily token warning"}</strong>
      <span>
        {used} of {limit} tokens used today ({usage.source}).
        {usage.locked
          ? " New analyses unlock at 00:00 UTC."
          : " New analyses will lock at 200,000 tokens."}
      </span>
    </div>
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

function PhaseOneScorecard({ video, metrics, packaging }) {
  return (
    <article className="phase-one-card">
      <div className="compact-heading phase-one-heading">
        <div>
          <p className="eyebrow">Video Stats / at a glance</p>
          <h2>Performance snapshot</h2>
        </div>
        <p>Hover over each performance item for its definition.</p>
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

      <div className="metadata-grid" aria-label="Public video metadata">
        <div className="metadata-box">
          <span>Category</span>
          <strong>{video.category.title}</strong>
        </div>
        <div className="metadata-box">
          <span>Duration</span>
          <strong>{formatDuration(video.durationSeconds)}</strong>
        </div>
        <div className="metadata-box">
          <span>Public caption flag</span>
          <strong>{video.captionsAvailable ? "Available" : "Not flagged"}</strong>
          <small>Owner transcript access is checked separately.</small>
        </div>
        <div className="metadata-box">
          <span>Thumbnail</span>
          <strong>{humanise(video.thumbnail?.quality ?? "unavailable")}</strong>
          {video.thumbnail?.width && video.thumbnail?.height ? (
            <small>{video.thumbnail.width} × {video.thumbnail.height}px</small>
          ) : null}
        </div>
      </div>

      <div className="tag-assessment">
        <div className="tag-assessment-copy">
          <span>Selected tags</span>
          <strong className={`tag-verdict ${packaging.tagUsefulness}`}>
            {humanise(packaging.tagUsefulness)}
          </strong>
          <p>{packaging.tagAssessment}</p>
        </div>
        {video.tags.length ? (
          <div className="tag-list" aria-label="Selected public tags">
            {video.tags.slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}
            {video.tags.length > 8 ? (
              <span className="tag-more">+{video.tags.length - 8} more</span>
            ) : null}
          </div>
        ) : (
          <p className="no-tags">No public tags were returned.</p>
        )}
      </div>
    </article>
  );
}

function InsightDigest({ packaging, audience, sampling }) {
  const visibleFeedback = audience.feedbackRows
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);

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
          <span>Evidence and sample details</span>
          <small>Open details</small>
        </summary>
        <div className="insight-details">
          <section>
            <h3>Packaging evidence</h3>
            <div className="compact-assessments">
              <span>Title <b>{humanise(packaging.titleClarity)}</b></span>
              <span>Thumbnail <b>{humanise(packaging.thumbnailClarity)}</b></span>
              <span>Alignment <b>{humanise(packaging.titleThumbnailAlignment)}</b></span>
              <span>Mismatch <b>{humanise(packaging.contentMismatchRisk)}</b></span>
            </div>
            {packaging.evidence.length > 0 && (
              <ul className="evidence-list">
                {packaging.evidence.slice(0, 3).map((evidence) => (
                  <li key={evidence}>{evidence}</li>
                ))}
              </ul>
            )}
            <p className="analysis-caveat">{packaging.limitation}</p>
          </section>

          <section>
            <h3>Audience signals</h3>
            <p className="table-note">
              Showing classifications found in the analysed sample; categories can overlap.
            </p>
            <div className="signal-summary-grid">
              {visibleFeedback.length ? visibleFeedback.map((row) => (
                <div key={row.category}>
                  <strong>{feedbackLabels[row.category]} · {formatNumber(row.count)}</strong>
                  <small>{humanise(row.confidence)} confidence</small>
                  <p>{row.observation}</p>
                </div>
              )) : <p>No recurring audience signals were classified.</p>}
            </div>
          </section>

          {audience.timestampedReactions.length > 0 && (
            <section>
              <h3>Timestamped reactions</h3>
              <div className="reaction-list">
                {audience.timestampedReactions.slice(0, 3).map((reaction) => (
                  <p key={`${reaction.seconds}-${reaction.observation}`}>
                    <b>{reaction.timestamp} · {humanise(reaction.sentiment)}</b>
                    {reaction.observation}
                  </p>
                ))}
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
            <ul className="limitation-list compact-limitations">
              {audience.limitations.slice(0, 3).map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </section>
        </div>
      </details>
    </article>
  );
}

function ScoreRing({ label, value }) {
  const known = Number.isInteger(value?.score);
  const tooltip = known
    ? `${label}: ${value.score}/100. ${value.finding}`
    : `${label}: Unknown. ${value?.finding || "Owner transcript unavailable."}`;
  return (
    <div
      className={`phase-two-score hover-help ${known ? "" : "unknown"}`}
      data-tip={tooltip}
      tabIndex="0"
    >
      <div
        className="score-ring"
        style={{ "--score": known ? value.score : 0 }}
        role="img"
        aria-label={tooltip}
      >
        <strong>{known ? value.score : "?"}</strong>
      </div>
      <span>{label}</span>
    </div>
  );
}

function PhaseTwoCompact({ phaseTwo, tokenBudget }) {
  const dimensions = phaseTwo.dimensions;
  const actualTokens = tokenBudget.actualTotalTokens;
  const usagePercent = Number.isInteger(actualTokens)
    ? Math.min(100, (actualTokens / tokenBudget.ceilingTokens) * 100)
    : 0;

  return (
    <article className="phase-two-card">
      <div className="compact-heading phase-two-heading">
        <div>
          <p className="eyebrow">AI Video Analysis / owner evidence</p>
          <h2>Video structure analysis</h2>
        </div>
        <span className="economy-badge">
          {humanise(tokenBudget.mode)} · ≤{formatNumber(tokenBudget.ceilingTokens)} tokens
        </span>
      </div>

      <div className="phase-two-layout">
        <div className="score-ring-grid">
          <ScoreRing label="Hook" value={dimensions.hook} />
          <ScoreRing label="Clarity" value={dimensions.clarity} />
          <ScoreRing label="Structure" value={dimensions.structure} />
          <ScoreRing label="Pacing" value={dimensions.pacing} />
        </div>
        <div className="phase-two-summary">
          <span className={`evidence-state ${phaseTwo.status}`}>
            Transcript: {phaseTwo.transcript.displayValue}
          </span>
          <p>{phaseTwo.summary}</p>
          <small>
            Visual/audio analysis: {phaseTwo.visualAnalysis.displayValue}
          </small>
        </div>
      </div>

      <p className="phase-two-score-guide">
        <b>How to read this:</b> Hook, clarity, structure, and pacing are
        0–100 observations from the supplied caption excerpts: lower scores
        suggest weaker evidence (for example, a 10/100 Hook is a weak opening);
        higher scores suggest stronger evidence. Timeline timestamps show where
        each caption excerpt occurs, not audience retention.
      </p>

      {phaseTwo.timeline.length > 0 && (
        <div className="timeline-panel">
          <div className="timeline-title">
            <span>Transcript signal over time</span>
            <small>0–100 evidence observations, not viewer retention</small>
          </div>
          <div
            className="timeline-chart"
            role="img"
            aria-label="Transcript evidence scores over the video timeline"
          >
            {phaseTwo.timeline.map((point) => (
              <span
                key={`${point.atSeconds}-${point.label}`}
                className={`timeline-column hover-help ${
                  point.score < 10 ? "low-score" : ""
                }`}
                style={{ "--height": `${point.score}%` }}
                data-tip={`${formatTimestamp(point.atSeconds)} · ${
                  point.score
                }/100 · ${point.label}`}
                tabIndex="0"
              >
                {point.score < 10 && (
                  <b className="timeline-score-above">{point.score}/100</b>
                )}
                <i aria-hidden="true">
                  {point.score >= 10 && <b>{point.score}/100</b>}
                </i>
              </span>
            ))}
          </div>
        </div>
      )}

      <details className="detail-drawer light-drawer phase-two-details">
        <summary>
          <span>Evidence, limitations, and token usage</span>
          <small>Open details</small>
        </summary>
        <div className="phase-two-detail-grid">
          <section>
            <h3>Strongest / weakest transcript evidence</h3>
            {phaseTwo.strongestMoment ? (
              <p>
                <b>{formatTimestamp(phaseTwo.strongestMoment.atSeconds)}</b>{" "}
                {phaseTwo.strongestMoment.finding}
              </p>
            ) : (
              <p><b>Strongest:</b> Unknown — the model timestamp could not be verified.</p>
            )}
            {phaseTwo.weakestMoment ? (
              <p>
                <b>{formatTimestamp(phaseTwo.weakestMoment.atSeconds)}</b>{" "}
                {phaseTwo.weakestMoment.finding}
              </p>
            ) : (
              <p><b>Weakest:</b> Unknown — the model timestamp could not be verified.</p>
            )}
          </section>
          <section>
            <h3>Budget and source</h3>
            <div className="token-track" title="Reported model-token usage">
              <span style={{ width: `${usagePercent}%` }}></span>
            </div>
            <p>
              {Number.isInteger(actualTokens)
                ? `${formatNumber(actualTokens)} of ${formatNumber(
                    tokenBudget.ceilingTokens,
                  )} model tokens used`
                : `Hard request controls target no more than ${formatNumber(
                    tokenBudget.ceilingTokens,
                  )} model tokens.`}
            </p>
            <p>
              Caption source:{" "}
              {phaseTwo.transcript.source === "youtube_owner_captions"
                ? "YouTube owner-authorised captions"
                : "Unknown"}
              . {phaseTwo.visualAnalysis.reason}
            </p>
          </section>
        </div>
      </details>
    </article>
  );
}

function ResultStage({ analysis }) {
  const { video, metrics, insights, phaseTwo, tokenBudget } = analysis;

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

      <PhaseOneScorecard
        video={video}
        metrics={metrics}
        packaging={insights.packaging}
      />
      <PhaseTwoCompact phaseTwo={phaseTwo} tokenBudget={tokenBudget} />
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
  const [analysisMode, setAnalysisMode] = useState("economy");
  const [configuration, setConfiguration] = useState(null);
  const [ownerAuth, setOwnerAuth] = useState(null);
  const [dailyUsage, setDailyUsage] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/health").then((response) => response.json()),
      fetch("/api/auth/status").then((response) => response.json()),
      fetch("/api/daily-token-usage").then((response) => response.json()),
    ])
      .then(([healthPayload, authPayload, usagePayload]) => {
        if (active) {
          setConfiguration(healthPayload.configuration);
          setOwnerAuth(authPayload.ownerAuth);
          setDailyUsage(usagePayload.usage);
        }
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

  async function logoutOwner() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOwnerAuth((current) => ({
      ...(current || {}),
      connected: false,
      channels: [],
    }));
  }

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
          analysisMode,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "The analysis could not be completed.",
        );
      }

      setAnalysis(payload.analysis);
      const usageResponse = await fetch("/api/daily-token-usage");
      if (usageResponse.ok) {
        const usagePayload = await usageResponse.json();
        setDailyUsage(usagePayload.usage);
      }
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
            <p className="eyebrow">Video inspection / Audience Reaction</p>
            <h1>
              Unlock Retention.
              <br />
              <em>Reap Rewards.</em>
            </h1>
            <p>
              Turn a YouTube URL into a reliable statisitic, transcription, frame analysis and GPT5.4 enriched concise
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
            <div className="owner-auth-strip owner-auth-priority">
              <div>
                <span>Creator-only transcript analysis</span>
                <strong>
                  {ownerAuth?.connected
                    ? `Connected: ${ownerAuth.channels.map((channel) => channel.title).join(", ")}`
                    : "Sign in to unlock owner captions"}
                </strong>
                <p>
                  Google access lets us analyse captions for videos you own,
                  enabling Hook, Clarity, Structure, and Pacing signals.
                </p>
              </div>
              {ownerAuth?.connected ? (
                <button type="button" className="auth-action" onClick={logoutOwner}>
                  Disconnect
                </button>
              ) : ownerAuth?.configured ? (
                <a className="auth-action" href="/auth/google/start">
                  Connect Google
                </a>
              ) : (
                <span className="auth-unavailable">OAuth not configured</span>
              )}
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
              <button type="submit" disabled={loading || dailyUsage?.locked}>
                {loading ? "Analysing…" : dailyUsage?.locked ? "Daily limit reached" : "Analyse video"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <small id="comment-help">
              Stratified top, recent, and highly liked threads; maximum 500.
            </small>
            <fieldset className="analysis-mode" disabled={loading}>
              <legend>Analysis depth</legend>
              <label className={analysisMode === "economy" ? "selected" : ""}>
                <input
                  type="radio"
                  name="analysis-mode"
                  value="economy"
                  checked={analysisMode === "economy"}
                  onChange={(event) => setAnalysisMode(event.target.value)}
                />
                <span><b>Economy</b><small>≤5,000 tokens · faster</small></span>
              </label>
              <label className={analysisMode === "heavy" ? "selected" : ""}>
                <input
                  type="radio"
                  name="analysis-mode"
                  value="heavy"
                  checked={analysisMode === "heavy"}
                  onChange={(event) => setAnalysisMode(event.target.value)}
                />
                <span><b>Heavy Analysis</b><small>≤10,000 tokens · deeper sample</small></span>
              </label>
            </fieldset>
            <span className="form-budget-note">
              {analysisMode === "heavy" ? "Heavy Analysis" : "Economy mode"}
              {" · one GPT request · "}
              {analysisMode === "heavy" ? "10,000" : "5,000"}-token ceiling
            </span>
            <DailyUsageNotice usage={dailyUsage} />
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
