import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ConfigurationNotice,
  DailyUsageNotice,
  ErrorNotice,
  Footer,
  formatDate,
  formatNumber,
  Header,
  OwnerAuthControl,
  SanityCard,
} from "./sharedDashboard.jsx";
import {
  DiscoveryStatistics,
  FormatNextVideoSuggestions,
  FormatPerformanceSnapshot,
  FormatRetentionChart,
  VideoTypeControl,
} from "./videoFormatDashboard.jsx";
import {
  DevFixtureControl,
  SyntheticFixtureBanner,
} from "./devFixtureControl.jsx";

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

function formatWatchTime(minutes) {
  if (!Number.isFinite(minutes)) return "Unavailable";
  if (minutes < 60) return `${formatNumber(minutes)} min`;
  return `${formatNumber(Math.round((minutes / 60) * 10) / 10)} hrs`;
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

function SiteValueExplanation() {
  return (
    <section className="site-value" aria-labelledby="site-value-title">
      <div className="site-value-intro">
        <p className="eyebrow">Why use YouTube Signal Lab?</p>
        <h2 id="site-value-title">From separate signals to a clearer next decision.</h2>
        <p>
          This complements YouTube Studio by bringing public performance,
          audience feedback, packaging, and optional creator evidence into one
          concise, evidence-conscious report.
        </p>
      </div>
      <div className="site-value-grid">
        <article>
          <span>01</span>
          <h3>One evidence view</h3>
          <p>Connect public statistics, channel standing, sampled comments, metadata, and owner captions.</p>
        </article>
        <article>
          <span>02</span>
          <h3>Signals become actions</h3>
          <p>Turn observations into three next-video subjects, practical improvements, and packaging guidance.</p>
        </article>
        <article>
          <span>03</span>
          <h3>Transparent analysis</h3>
          <p>Keep deterministic calculations separate from AI interpretation, with visible samples, limits, and Unknown states.</p>
        </article>
        <article>
          <span>04</span>
          <h3>Public and creator perspectives</h3>
          <p>Inspect any public video, then unlock richer caption evidence for videos owned by the connected creator.</p>
        </article>
      </div>
    </section>
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

function PhaseOneScorecard({ video, metrics, packaging, retention }) {
  const ownerMetrics = retention.overview;
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

      <div className="compact-metric-grid retention-metric-grid">
        <CompactMetric
          label="Average view duration"
          value={Number.isInteger(ownerMetrics?.averageViewDurationSeconds)
            ? formatDuration(ownerMetrics.averageViewDurationSeconds)
            : "Unavailable"}
          note="owner analytics"
          tooltip="YouTube Analytics' average length of a playback for this video."
        />
        <CompactMetric
          label="Average viewed"
          value={Number.isFinite(ownerMetrics?.averageViewPercentage)
            ? `${ownerMetrics.averageViewPercentage}%`
            : "Unavailable"}
          note="of video"
          tooltip="YouTube Analytics' average percentage of the video watched per playback."
        />
        <CompactMetric
          label="Watch time"
          value={formatWatchTime(ownerMetrics?.watchTimeMinutes)}
          note="total"
          tooltip="Total estimated minutes watched in the owner-authorised reporting period."
        />
        <CompactMetric
          label="First 30 seconds"
          value={Number.isFinite(retention.firstThirtySeconds?.audienceWatchPercentage)
            ? `${retention.firstThirtySeconds.audienceWatchPercentage}%`
            : "Unavailable"}
          note="measured retention"
          tooltip="The measured audience-watch ratio at the retention point nearest 30 seconds."
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

function NextVideoSuggestions({ recommendations, retention }) {
  if (!recommendations) return null;
  const subjects = [...recommendations.subjects].sort((left, right) =>
    left.priority === right.priority
      ? 0
      : left.priority === "most_recommended"
        ? -1
        : 1,
  );
  const optimisationLabels = {
    title: "Title",
    thumbnail: "Thumbnail",
    description: "Description",
    tags: "Tags",
    captions: "Captions",
  };
  const retentionEvidence = recommendations.retentionEvidence ?? {
    carryForward: [],
    improvements: [],
  };
  const explanationsByMoment = new Map(
    (retention?.momentExplanations ?? []).map((moment) => [
      `${moment.kind}:${moment.atSeconds}`,
      moment,
    ]),
  );
  const explanationSummary = (item) => {
    const moment = explanationsByMoment.get(`${item.kind}:${item.atSeconds}`);
    return moment?.hypothesis ? ` Why: ${moment.hypothesis}` : "";
  };

  return (
    <article className="next-video-card">
      <div className="compact-heading next-video-heading">
        <div>
          <p className="eyebrow">Creator playbook / next upload</p>
          <h2>Suggestions for your next video</h2>
        </div>
        <span className="recommendation-badge">Evidence-led ideas</span>
      </div>

      <section className="next-video-section next-video-subjects">
        <h3 className="next-video-section-title">Three potential subjects</h3>
        <div className="subject-grid">
          {subjects.map((subject, index) => (
            <section
              className={subject.priority === "most_recommended" ? "recommended" : ""}
              key={`${subject.subject}-${index}`}
            >
              <span>
                {subject.priority === "most_recommended"
                  ? "Most recommended"
                  : `Alternative ${index}`}
              </span>
               <h3>{subject.subject}</h3>
               <strong>{subject.angle}</strong>
               <p>{subject.rationale}</p>
               <p className="subject-execution"><b>Make it:</b> {subject.execution}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="next-video-section">
        <h3 className="next-video-section-title">What to retain and improve</h3>
        {retentionEvidence.carryForward.length || retentionEvidence.improvements.length ? (
          <p className="next-video-section-note">
            Timestamped items use measured retention; their brief “Why” notes summarise the evidence-led explanations above.
          </p>
        ) : null}
        <div className="next-video-guidance">
        <section>
          <h3>Carry forward</h3>
          <ul>
            {recommendations.carryForward.map((item) => <li key={item}>{item}</li>)}
            {retentionEvidence.carryForward.map((item) => (
              <li className="measured-evidence" key={`${item.atSeconds}-${item.text}`}>
                <b>{formatTimestamp(item.atSeconds)}</b> {item.text}
                {explanationSummary(item)}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Improve next time</h3>
          <ul>
            {recommendations.improvements.map((item) => <li key={item}>{item}</li>)}
            {retentionEvidence.improvements.map((item) => (
              <li className="measured-evidence" key={`${item.atSeconds}-${item.text}`}>
                <b>{formatTimestamp(item.atSeconds)}</b> {item.text}
                {explanationSummary(item)}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Retention approach</h3>
          <ul>{recommendations.retentionGuidance.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        </div>
      </section>

      <section className="next-video-section">
        <h3 className="next-video-section-title">Packaging, discovery, and accessibility</h3>
        <div className="optimisation-grid">
          {Object.entries(optimisationLabels).map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <p>{recommendations.optimisation[key]}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="next-action">
        <span>Best next action</span>
        <strong>{recommendations.nextAction}</strong>
      </div>
      <p className="recommendation-caveat">{recommendations.caveat}</p>
    </article>
  );
}

function InsightDigest({ packaging, audience, sampling, crossEvidence }) {
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

      <section className="cross-evidence-summary">
        <div>
          <span className="digest-label">Cross-evidence summary</span>
          <strong>{humanise(crossEvidence.expectationMatch)}</strong>
        </div>
        <p>{crossEvidence.summary}</p>
        {crossEvidence.evidence.length > 0 && (
          <ul>{crossEvidence.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
        )}
      </section>

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
            {audience.limitations.length > 0 && (
              <p className="analysis-caveat">{audience.limitations.slice(0, 2).join(" · ")}</p>
            )}
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

        </div>
      </details>
    </article>
  );
}

function ScoreRing({ label, value }) {
  const known = Number.isInteger(value?.score);
  const tooltip = known
    ? `${label}: ${Math.round(value.score) / 10}/10. ${value.finding}${
        label === "Hook" && value.retentionContext
          ? ` Measured retention: ${value.retentionContext}`
          : ""
      }`
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
        <strong>{known ? Math.round(value.score) / 10 : "?"}</strong>
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
        displayed out of 10 from the supplied caption excerpts. Scores of 7–8
        indicate strong, usable evidence; 9–10 is exceptional rather than
        required. Timeline timestamps show where each caption excerpt occurs.
        Owner retention remains a separate measured signal.
      </p>
      <p className="hook-retention-context">
        <b>Hook retention context:</b> {dimensions.hook.retentionContext}
      </p>

      {phaseTwo.timeline.length > 0 && (
        <div className="timeline-panel">
          <div className="timeline-title">
            <span>Transcript signal over time</span>
            <small>0–10 evidence observations, not viewer retention</small>
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
                  point.score < 40 ? "low-score" : ""
                }`}
                style={{ "--height": `${point.score}%` }}
                data-tip={`${formatTimestamp(point.atSeconds)} · ${
                  Math.round(point.score) / 10
                }/10 transcript score · ${point.label}${
                  Number.isFinite(point.measuredRetentionPercentage)
                    ? ` · ${point.measuredRetentionPercentage}% measured retention`
                    : " · measured retention unavailable"
                }`}
                tabIndex="0"
              >
                {point.score < 40 && (
                  <b className="timeline-score-above">{Math.round(point.score) / 10}/10</b>
                )}
                <i aria-hidden="true">
                  {point.score >= 40 && <b>{Math.round(point.score) / 10}/10</b>}
                </i>
                <small className="timeline-timestamp">
                  {formatTimestamp(point.atSeconds)}
                </small>
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

function retentionIntroLabel(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value >= 70) return "Strong intro retention";
  if (value >= 50) return "Moderate intro retention";
  return "Weak intro retention";
}

function RetentionChart({ retention, durationSeconds }) {
  if (retention.status !== "available") {
    const needsReconnect = /Reconnect Google/i.test(retention.reason ?? "");
    return (
      <article className="retention-card retention-unavailable">
        <div className="compact-heading">
          <div>
            <p className="eyebrow">Owner analytics / measured behaviour</p>
            <h2>Analysed Video Retention information</h2>
          </div>
          <span className="evidence-state unknown">Unavailable</span>
        </div>
        <p>{retention.reason}</p>
        {needsReconnect ? (
          <a className="auth-action retention-reconnect" href="/auth/google/start">
            Reconnect Google
          </a>
        ) : null}
        <p className="retention-note">Retention is retrieved directly from YouTube Analytics; it does not consume GPT tokens.</p>
      </article>
    );
  }

  const width = 1_000;
  const height = 260;
  const plotTop = 18;
  const plotBottom = 220;
  const maximum = Math.max(
    100,
    Math.ceil(Math.max(...retention.points.map((point) => point.audienceWatchPercentage)) / 10) * 10,
  );
  const coordinates = retention.points.map((point) => ({
    ...point,
    x: point.atRatio * width,
    y: plotBottom - (point.audienceWatchPercentage / maximum) * (plotBottom - plotTop),
  }));
  const linePath = coordinates.map((point, index) =>
    `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const areaPath = `M0,${plotBottom} L${coordinates[0].x.toFixed(1)},${coordinates[0].y.toFixed(1)} ${coordinates
    .slice(1)
    .map((point) => `L${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ")} L${width},${plotBottom} Z`;
  const relative = retention.relativePerformance;
  const strongest = retention.strongestSection;
  const intro = retention.firstThirtySeconds;

  return (
    <article className="retention-card">
      <div className="compact-heading retention-heading">
        <div>
          <p className="eyebrow">Owner analytics / measured behaviour</p>
          <h2>Analysed Video Retention information</h2>
        </div>
        <span className="evidence-state analysed">YouTube measured</span>
      </div>

      <div className="retention-stat-grid">
        <div><span>Intro</span><strong>{intro.audienceWatchPercentage}%</strong><small>{retentionIntroLabel(intro.audienceWatchPercentage)}</small></div>
        <div><span>Strongest section</span><strong>{formatTimestamp(strongest.startSeconds)}–{formatTimestamp(strongest.endSeconds)}</strong><small>{strongest.averageRetentionPercentage}% average retention</small></div>
        <div>
          <span>Similar-length comparison</span>
          <strong>{Number.isFinite(relative.averageScore) ? humanise(relative.classification) : "Withheld"}</strong>
          <small>{Number.isFinite(relative.averageScore) ? `${relative.averageScore}/100 YouTube relative-retention score` : "YouTube typical comparison unavailable"}</small>
        </div>
        <div><span>Detected changes</span><strong>{retention.dips.length} dips · {retention.spikes.length} spikes</strong><small>≥5 percentage-point local movement</small></div>
      </div>

      <div className="retention-chart-panel">
        <div className="retention-chart-title">
          <span>Audience retention across the video</span>
          <small>Hover over a point for measured values</small>
        </div>
        <svg className="retention-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Measured YouTube audience retention line chart">
          {[0, 0.5, 1].map((ratio) => {
            const y = plotBottom - ratio * (plotBottom - plotTop);
            return <line key={ratio} x1="0" x2={width} y1={y} y2={y} className="retention-gridline" />;
          })}
          <path d={areaPath} className="retention-area" />
          <path d={linePath} className="retention-line" />
          {coordinates.map((point) => (
            <circle key={point.atRatio} cx={point.x} cy={point.y} r="3" className="retention-point">
              <title>{`${formatTimestamp(point.atSeconds)} · ${point.audienceWatchPercentage}% retained · ${Number.isFinite(point.relativeRetentionScore) ? `${point.relativeRetentionScore}/100 relative` : "relative comparison unavailable"} · ${formatNumber(point.startedWatching)} starts · ${formatNumber(point.stoppedWatching)} stops · ${formatNumber(point.segmentImpressions)} segment views`}</title>
            </circle>
          ))}
          <text x="8" y="14" className="retention-axis-label">{maximum}%</text>
          <text x="8" y={plotBottom - 4} className="retention-axis-label">0%</text>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <text key={ratio} x={ratio * width} y="250" textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"} className="retention-axis-label">
              {formatTimestamp(Math.round(durationSeconds * ratio))}
            </text>
          ))}
        </svg>
      </div>
      <p className="retention-chart-note">
        This line uses <b>absolute retention</b>: the share of views watching each point in this video.
        {Number.isFinite(relative.averageScore)
          ? " Typical retention is available separately in the similar-length comparison."
          : " Typical retention is unavailable, so no similar-video benchmark is applied to this line."}
      </p>

      <div className="retention-moments">
        <section>
          <h3>Significant dips</h3>
          {retention.dips.length ? retention.dips.map((dip) => (
            <p key={dip.atSeconds}><b>{formatTimestamp(dip.atSeconds)}</b> Fell {Math.abs(dip.changePercentagePoints)} points to {dip.audienceWatchPercentage}%.</p>
          )) : <p>No ≥5-point local dips were detected.</p>}
        </section>
        <section>
          <h3>Significant spikes</h3>
          {retention.spikes.length ? retention.spikes.map((spike) => (
            <p key={spike.atSeconds}><b>{formatTimestamp(spike.atSeconds)}</b> Rose {spike.changePercentagePoints} points to {spike.audienceWatchPercentage}%.</p>
          )) : <p>No ≥5-point local spikes were detected.</p>}
        </section>
      </div>
      {retention.momentExplanations?.length ? (
        <section className="retention-explanations">
          <div>
            <h3>Why these moments may have changed</h3>
            <p>Measured changes are shown first. The explanation is an evidence-led hypothesis, not proof of causation.</p>
          </div>
          {retention.momentExplanations.map((moment) => (
            <article key={`${moment.kind}-${moment.atSeconds}`}>
              <header>
                <strong>{formatTimestamp(moment.atSeconds)} · {humanise(moment.kind)}</strong>
                <span className={moment.kind === "dip" ? "retention-dip" : "retention-spike"}>
                  {moment.kind === "dip" ? "Drop" : "Rise"} {Math.abs(moment.changePercentagePoints)} pts
                </span>
              </header>
              <p className="retention-hard-evidence">
                {moment.audienceWatchPercentage}% retained. Nearest transcript evidence: {Number.isInteger(moment.nearestTranscriptAtSeconds) ? formatTimestamp(moment.nearestTranscriptAtSeconds) : "unavailable"}; {moment.timestampedCommentCount ?? 0} nearby timestamped comment{moment.timestampedCommentCount === 1 ? "" : "s"}.
              </p>
              <p><b>Evidence context:</b> {moment.evidence ?? "No AI evidence paraphrase was available."}</p>
              <p><b>Possible explanation:</b> {moment.hypothesis ?? "No AI hypothesis was available."} <small>{moment.confidence ? `${humanise(moment.confidence)} confidence` : ""}</small></p>
            </article>
          ))}
        </section>
      ) : null}
      <p className="retention-note">Measured owner-only YouTube Analytics data. Values can exceed 100% when viewers replay a segment. This retrieval does not consume GPT tokens.</p>
    </article>
  );
}

function ResultStage({ analysis }) {
  const {
    video,
    videoFormat,
    metrics,
    insights,
    phaseTwo,
    retention,
    discovery,
    tokenBudget,
  } = analysis;

  return (
    <section className="result-stage">
      <SyntheticFixtureBanner fixture={analysis.fixture} />
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

      <FormatPerformanceSnapshot
        video={video}
        videoFormat={videoFormat}
        metrics={metrics}
        packaging={insights.packaging}
        retention={retention}
        tagRecommendation={insights.nextVideo?.optimisation?.tags}
      />
      <PhaseTwoCompact phaseTwo={phaseTwo} tokenBudget={tokenBudget} />
      <FormatRetentionChart
        retention={retention}
        durationSeconds={video.durationSeconds}
        videoFormat={videoFormat}
      />
      <DiscoveryStatistics discovery={discovery} videoFormat={videoFormat} />
      <FormatNextVideoSuggestions
        recommendations={insights.nextVideo}
        retention={retention}
        videoFormat={videoFormat}
      />
      <InsightDigest
        packaging={insights.packaging}
        audience={insights.audience}
        sampling={video.commentSampling}
        crossEvidence={insights.crossEvidence}
      />

      <SanityCard sanity={analysis.sanity} />
    </section>
  );
}

function App() {
  const [url, setUrl] = useState("");
  const [maxComments, setMaxComments] = useState(100);
  const [analysisMode, setAnalysisMode] = useState("economy");
  const [videoType, setVideoType] = useState("auto");
  const [dataSource, setDataSource] = useState("real");
  const [configuration, setConfiguration] = useState(null);
  const [ownerAuth, setOwnerAuth] = useState(null);
  const [dailyUsage, setDailyUsage] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const usingFixture = dataSource === "synthetic-short";
  const devFixturesEnabled = configuration?.devFixturesEnabled === true;

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

  function changeDataSource(nextSource) {
    setDataSource(nextSource);
    setAnalysis(null);
    setError("");
    if (nextSource === "synthetic-short") {
      setVideoType("short");
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setAnalysis(null);
    setLoading(true);

    try {
      const response = await fetch(
        usingFixture
          ? "/api/dev-fixtures/synthetic-short"
          : "/api/video-analysis",
        usingFixture
          ? { method: "POST" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: url.trim(),
                maxComments: Number(maxComments),
                analysisMode,
                videoType,
              }),
            },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "The analysis could not be completed.",
        );
      }

      setAnalysis(payload.analysis);
      if (!usingFixture) {
        const usageResponse = await fetch("/api/daily-token-usage");
        if (usageResponse.ok) {
          const usagePayload = await usageResponse.json();
          setDailyUsage(usagePayload.usage);
        }
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

          <form
            className={`analysis-form ${usingFixture ? "fixture-mode" : ""}`}
            onSubmit={submit}
          >
            <DevFixtureControl
              enabled={devFixturesEnabled}
              value={dataSource}
              onChange={changeDataSource}
              disabled={loading}
            />
            <label htmlFor="video-url">
              {usingFixture ? "YouTube video URL (not used by fixture)" : "YouTube video URL"}
            </label>
            <div className="url-control">
              <span aria-hidden="true">▶</span>
              <input
                id="video-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={usingFixture ? "Synthetic fixture supplies its own Short" : "https://www.youtube.com/watch?v=…"}
                autoComplete="url"
                required={!usingFixture}
                disabled={loading || usingFixture}
              />
            </div>
            {usingFixture ? (
              <div className="dev-fixture-bypass">
                <strong>Owner access is simulated</strong>
                <span>
                  Captions, engaged views, retention, discovery and AI
                  explanations come from static fixture data.
                </span>
              </div>
            ) : (
              <OwnerAuthControl
                ownerAuth={ownerAuth}
                returnTo="/VideoDashboard.html"
                onDisconnect={logoutOwner}
                title="Creator-only transcript and retention analysis"
                description="Google access lets us analyse captions and measured retention for videos you own, including Hook, Clarity, Structure, and Pacing context."
              />
            )}
            <VideoTypeControl
              value={usingFixture ? "short" : videoType}
              onChange={setVideoType}
              disabled={loading || usingFixture}
            />
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
                  disabled={loading || usingFixture}
                />
              </label>
              <button
                type="submit"
                disabled={
                  loading || (!usingFixture && dailyUsage?.locked)
                }
              >
                {loading
                  ? usingFixture
                    ? "Loading fixture…"
                    : "Analysing…"
                  : usingFixture
                    ? "Load synthetic Short"
                    : dailyUsage?.locked
                      ? "Daily limit reached"
                      : "Analyse video"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <small id="comment-help">
              {usingFixture
                ? "Fixture includes 24 synthetic analysed comment threads."
                : "Stratified top, recent, and highly liked threads; maximum 500."}
            </small>
            <fieldset
              className="analysis-mode"
              disabled={loading || usingFixture}
            >
              <legend>Analysis depth</legend>
              <label className={analysisMode === "economy" ? "selected" : ""}>
                <input
                  type="radio"
                  name="analysis-mode"
                  value="economy"
                  checked={analysisMode === "economy"}
                  onChange={(event) => setAnalysisMode(event.target.value)}
                />
                <span><b>Economy</b><small>≤6,500 tokens · faster</small></span>
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
              {usingFixture ? (
                "Synthetic fixture · zero external requests · zero tokens"
              ) : (
                <>
                  {analysisMode === "heavy" ? "Heavy Analysis" : "Economy mode"}
                  {" · one GPT request · "}
                  {analysisMode === "heavy" ? "10,000" : "6,500"}-token ceiling
                </>
              )}
            </span>
            {!usingFixture ? <DailyUsageNotice usage={dailyUsage} /> : null}
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
        <SiteValueExplanation />
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
