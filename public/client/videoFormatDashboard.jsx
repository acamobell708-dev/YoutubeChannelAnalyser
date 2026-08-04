import React from "react";

import { formatNumber } from "./sharedDashboard.jsx";

function decimal(value, suffix = "") {
  return Number.isFinite(value) ? `${formatNumber(value)}${suffix}` : "—";
}

function duration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "Unavailable";
  const rounded = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return minutes ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`;
}

function timestamp(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "—";
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function MetricCard({ label, value, note, help, replay = false }) {
  return (
    <div
      className={`format-metric hover-help ${replay ? "replay-value" : ""}`}
      data-tip={help}
      tabIndex="0"
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export function VideoTypeControl({ value, onChange, disabled = false }) {
  return (
    <fieldset className="video-type-control" disabled={disabled}>
      <legend>Analysis lens</legend>
      <div className="video-type-slider">
        {[
          ["auto", "Auto", "Use owner classification when available"],
          ["short", "Short", "Shorts-specific reach and retention"],
          ["standard", "Standard video", "Long-form/video-on-demand analysis"],
        ].map(([id, label, description]) => (
          <label key={id} className={value === id ? "selected" : ""}>
            <input
              type="radio"
              name="video-type"
              value={id}
              checked={value === id}
              onChange={(event) => onChange(event.target.value)}
            />
            <span>
              <b>{label}</b>
              <small>{description}</small>
            </span>
          </label>
        ))}
        <i
          aria-hidden="true"
          style={{
            "--video-type-index":
              value === "short" ? 1 : value === "standard" ? 2 : 0,
          }}
        />
      </div>
    </fieldset>
  );
}

function rankStanding(ranking) {
  const available =
    Number.isInteger(ranking?.rank) &&
    Number.isInteger(ranking?.outOf) &&
    ranking.outOf > 0;

  if (!available) {
    return {
      available: false,
      standing: 0,
      topPercent: null,
      rankText: "Unavailable",
    };
  }

  const rawStanding =
    ranking.outOf === 1
      ? 100
      : ((ranking.outOf - ranking.rank) / (ranking.outOf - 1)) * 100;

  return {
    available: true,
    standing: Math.max(0, Math.min(100, rawStanding)),
    topPercent: Math.max(
      1,
      Math.ceil((ranking.rank / ranking.outOf) * 100),
    ),
    rankText: `#${ranking.rank} of ${ranking.outOf}`,
  };
}

function StandingBar({ label, ranking, noun, accent }) {
  const result = rankStanding(ranking);
  const description = result.available
    ? `${label}: ${result.rankText} by lifetime ${noun} within the selected format cohort.`
    : `${label} is unavailable because no comparable public ${noun} total was returned.`;

  return (
    <div
      className={`format-standing-meter ${accent} hover-help`}
      data-tip={description}
      tabIndex="0"
    >
      <div className="format-standing-heading">
        <span>{label}</span>
        <strong>{result.rankText}</strong>
      </div>
      <div
        className={`format-standing-track ${
          result.available ? "" : "unavailable"
        }`}
        role="img"
        aria-label={description}
      >
        <span style={{ width: `${result.standing}%` }}></span>
        {result.available ? (
          <i style={{ left: `${result.standing}%` }}></i>
        ) : null}
      </div>
      <div className="format-standing-scale">
        <small>Lower</small>
        <b>
          {result.available ? `Top ${result.topPercent}%` : "Unavailable"}
        </b>
        <small>Higher</small>
      </div>
      <p>Lifetime {noun} compared with the current format-relative cohort.</p>
    </div>
  );
}

function RankSummary({ videoFormat, metrics }) {
  const ranking = metrics.formatRelativeRanking;
  if (!ranking) return null;

  const formatLabel =
    videoFormat.resolved === "short"
      ? "Short proxy cohort"
      : "Standard-video proxy cohort";

  return (
    <section
      className="format-ranking"
      aria-label="Format-relative performance standing"
    >
      <div className="format-ranking-heading">
        <div>
          <span>Visual channel standing</span>
          <strong>{formatLabel}</strong>
        </div>
        <small>Higher bars indicate a stronger lifetime position.</small>
      </div>

      <div className="format-standing-grid">
        <StandingBar
          label="View standing"
          ranking={ranking.views}
          noun="views"
          accent="views"
        />
        <StandingBar
          label="Comment standing"
          ranking={ranking.comments}
          noun="comments"
          accent="comments"
        />
      </div>

      <p className="format-ranking-caveat">{ranking.caveat}</p>
    </section>
  );
}

function StandardMetrics({ metrics, retention }) {
  const overview = retention.overview;
  return (
    <>
      <div className="format-metric-grid standard-public-metrics">
        <MetricCard
          label="Daily reach"
          value={decimal(metrics.viewsPerDay)}
          note="lifetime views / day"
          help="Current lifetime public views divided by the video's age. This is age-normalised reach, not current velocity."
        />
        <MetricCard
          label="Like rate"
          value={decimal(metrics.likesPer100Views)}
          note="per 100 public views"
          help="Current public likes divided by current public views, multiplied by 100."
        />
        <MetricCard
          label="Comment rate"
          value={decimal(metrics.commentsPer100Views)}
          note="per 100 public views"
          help="Current reported public comments divided by current public views, multiplied by 100."
        />
      </div>
      <div className="format-metric-grid format-retention-metrics">
        <MetricCard
          label="Average view duration"
          value={duration(overview?.averageViewDurationSeconds)}
          note="average playback across views"
          help="YouTube Analytics' average playback duration across views for this video."
        />
        <MetricCard
          label="Average viewed"
          value={decimal(overview?.averageViewPercentage, "%")}
          note="of the video"
          help="YouTube Analytics' average percentage of the video watched per playback."
        />
        <MetricCard
          label="Watch time"
          value={Number.isFinite(overview?.watchTimeMinutes)
            ? `${formatNumber(overview.watchTimeMinutes)} min`
            : "Unavailable"}
          note="owner Analytics total"
          help="Total estimated minutes watched during the report period."
        />
        <MetricCard
          label="First 30 seconds"
          value={decimal(
            retention.checkpoints?.firstThirtySeconds?.audienceWatchPercentage ??
              retention.firstThirtySeconds?.audienceWatchPercentage,
            "%",
          )}
          note="measured retention"
          help="Audience retention at the retention point nearest 30 seconds."
        />
      </div>
    </>
  );
}

function PublicShortMetrics({ metrics }) {
  return (
    <div className="format-metric-grid short-public-metrics">
      <MetricCard
        label="Engaged views/day"
        value="Owner required"
        note="not public data"
        help="YouTube does not expose engagedViews publicly. Connect the owner account to calculate engaged views per day."
      />
      <MetricCard
        label="Engaged-view share"
        value="Owner required"
        note="engaged views / starts"
        help="Requires owner Analytics because engagedViews is not part of the public video resource."
      />
      <MetricCard
        label="Public like rate"
        value={decimal(metrics.likesPer100Views)}
        note="per 100 reported views"
        help="Public likes divided by reported public Shorts views. Shorts starts and replays can be counted as views, so this is not an engaged-view rate."
      />
      <MetricCard
        label="Public comment rate"
        value={decimal(metrics.commentsPer100Views)}
        note="per 100 reported views"
        help="Public comments divided by reported public Shorts views. Connect the owner account for an engaged-view denominator."
      />
    </div>
  );
}

function OwnerShortMetrics({ metrics }) {
  return (
    <div className="format-metric-grid short-owner-metrics">
      <MetricCard
        label="Engaged views/day"
        value={decimal(metrics.engagedViewsPerDay)}
        note="owner engaged views / age"
        help="Owner Analytics engagedViews divided by the video's age in days."
      />
      <MetricCard
        label="Engaged-view share"
        value={decimal(metrics.engagedViewSharePercent, "%")}
        note="engaged views / starts"
        help="Engaged-view share = owner Analytics engagedViews divided by owner Analytics views, multiplied by 100. For Shorts, views include starts and replays; engagedViews are playbacks that continued beyond YouTube's initial seconds."
      />
      <MetricCard
        label="Likes"
        value={decimal(metrics.likesPer100EngagedViews)}
        note="per 100 engaged views"
        help="Owner Analytics likes divided by engagedViews, multiplied by 100."
      />
      <MetricCard
        label="Comments"
        value={decimal(metrics.commentsPer100EngagedViews)}
        note="per 100 engaged views"
        help="Owner Analytics comments divided by engagedViews, multiplied by 100."
      />
      <MetricCard
        label="Shares"
        value={decimal(metrics.sharesPer100EngagedViews)}
        note="per 100 engaged views"
        help="Owner Analytics shares divided by engagedViews, multiplied by 100."
      />
      <MetricCard
        label="Net subscribers"
        value={decimal(metrics.netSubscribersPer100EngagedViews)}
        note="per 100 engaged views"
        help={`Net subscribers are subscribers gained minus subscribers lost, divided by engagedViews. Gained: ${formatNumber(metrics.subscribersGained)}; lost: ${formatNumber(metrics.subscribersLost)}.`}
      />
    </div>
  );
}

function ShortRetentionMetrics({ retention }) {
  const overview = retention.overview;
  const averageViewed = overview?.averageViewPercentage;
  return (
    <div className="format-metric-grid short-retention-metrics">
      <MetricCard
        label="Average engaged-view duration"
        value={duration(overview?.averageViewDurationSeconds)}
        note="among engaged Shorts views"
        help="For Shorts, YouTube calculates average view duration using engaged views and their watch time. Engaged does not mean an exact three-second threshold."
      />
      <MetricCard
        label="Average viewed"
        value={decimal(averageViewed, "%")}
        note={averageViewed > 100 ? "possible replay/loop activity" : "among engaged views"}
        replay={averageViewed > 100}
        help="Average percentage viewed among engaged Shorts views. Values above 100% are valid and can indicate replaying or looping."
      />
      <MetricCard
        label="First 3 seconds"
        value={decimal(retention.firstThreeSeconds?.audienceWatchPercentage, "%")}
        note="opening hold"
        help="Measured audience retention at the point nearest three seconds. This is a retention checkpoint, not the definition of engagedViews."
      />
      <MetricCard
        label="Midpoint retention"
        value={decimal(retention.midpoint?.audienceWatchPercentage, "%")}
        note="50% of duration"
        help="Measured audience retention at the point nearest the middle of the Short."
      />
      <MetricCard
        label="End retention"
        value={decimal(retention.end?.audienceWatchPercentage, "%")}
        note="nearest final point"
        help="Measured audience retention at the final available point."
      />
    </div>
  );
}

export function FormatPerformanceSnapshot({
  video,
  videoFormat,
  metrics,
  packaging,
  retention,
  tagRecommendation,
}) {
  const short = videoFormat.resolved === "short";
  const ownerShort = short && Number.isFinite(retention.overview?.engagedViews);
  return (
    <article className="phase-one-card format-performance-card">
      <div className="compact-heading phase-one-heading">
        <div>
          <p className="eyebrow">{short ? "Shorts lens" : "Standard-video lens"} / at a glance</p>
          <h2>Performance snapshot</h2>
        </div>
        <span className={`format-confidence ${videoFormat.confidence}`}>
          {videoFormat.label}
        </span>
      </div>
      {videoFormat.caveat ? <p className="format-caveat">{videoFormat.caveat}</p> : null}

      {short ? (
        <>
          {ownerShort ? <OwnerShortMetrics metrics={metrics} /> : <PublicShortMetrics metrics={metrics} />}
          <ShortRetentionMetrics retention={retention} />
        </>
      ) : (
        <StandardMetrics metrics={metrics} retention={retention} />
      )}

      <RankSummary videoFormat={videoFormat} metrics={metrics} />

      <div className="metadata-grid" aria-label="Public video metadata">
        <div className="metadata-box"><span>Category</span><strong>{video.category.title}</strong></div>
        <div className="metadata-box"><span>Duration</span><strong>{duration(video.durationSeconds)}</strong></div>
        <div className="metadata-box"><span>Public caption flag</span><strong>{video.captionsAvailable ? "Available" : "Not flagged"}</strong></div>
        <div className="metadata-box"><span>Thumbnail</span><strong>{video.thumbnail?.quality ?? "Unavailable"}</strong></div>
      </div>

      <div className="tag-assessment">
        <div className="tag-assessment-copy">
          <span>GPT assessment of selected tags</span>
          <strong className={`tag-verdict ${packaging.tagUsefulness}`}>
            {String(packaging.tagUsefulness ?? "unknown").replaceAll("_", " ")}
          </strong>
          <p className="tag-analysis">{packaging.tagAssessment}</p>
          {tagRecommendation ? (
            <div className="tag-recommendation">
              <span>Suggested tag direction</span>
              <p>{tagRecommendation}</p>
            </div>
          ) : null}
        </div>
        {video.tags.length ? (
          <div className="tag-list" aria-label="Selected public tags">
            {video.tags.slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        ) : <p className="no-tags">No public tags were returned.</p>}
      </div>
    </article>
  );
}

export function DiscoveryStatistics({ discovery, videoFormat }) {
  const short = videoFormat.resolved === "short";
  return (
    <article className="discovery-card">
      <div className="compact-heading">
        <div>
          <p className="eyebrow">Owner discovery evidence</p>
          <h2>{short ? "How this Short was discovered" : "How viewers found this video"}</h2>
        </div>
        <span className="evidence-state">
          {discovery?.status === "available" ? "Available" : "Owner data needed"}
        </span>
      </div>
      {discovery?.status === "available" ? (
        <div className="discovery-grid">
          {discovery.rows.map((row) => (
            <div key={row.id}>
              <span>
                {short && row.id === "sound_pages"
                  ? "Sound / audio pages"
                  : row.label}
              </span>
              <strong>{Number.isFinite(row.sharePercent) ? `${row.sharePercent}%` : "—"}</strong>
              <small>{formatNumber(row.value)} {discovery.metric === "engagedViews" ? "engaged views" : "views"}</small>
            </div>
          ))}
        </div>
      ) : <p className="discovery-unavailable">{discovery?.reason ?? "Connect the owner account to retrieve traffic-source data."}</p>}
      {short ? (
        <aside className="discovery-source-note">
          <strong>What “Sound / audio pages” means</strong>
          <p>
            These viewers reached the Short from a YouTube page that groups
            Shorts using the same audio. It is a referral source, not proof that
            the sound caused the performance. A broader alternative presentation
            would be “Other YouTube surfaces”, combining hashtag, channel,
            subscriber, related-video, and other YouTube-page referrals.
          </p>
        </aside>
      ) : (
        <aside className="thumbnail-reach-note">
          <strong>Thumbnail impressions and click-through rate</strong>
          <p>{discovery?.thumbnailReach?.reason ?? "Unavailable in this targeted Analytics request."}</p>
        </aside>
      )}
    </article>
  );
}

function humaniseRetentionLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function RetentionMomentExplanations({ retention, short }) {
  const moments = retention.momentExplanations ?? [];
  if (!moments.length) return null;

  return (
    <section className="retention-ai-explanations">
      <div className="retention-ai-heading">
        <div>
          <p className="eyebrow">Measured change + AI interpretation</p>
          <h3>
            {short
              ? "Why these Short moments may have changed"
              : "Why these video moments may have changed"}
          </h3>
        </div>
        <span>{moments.length} explained moment{moments.length === 1 ? "" : "s"}</span>
      </div>

      <p className="retention-ai-disclaimer">
        YouTube supplies the measured retention change. GPT uses nearby
        owner-authorised caption excerpts and timestamped comments to suggest a
        possible explanation. It is evidence-led interpretation, not proof of
        causation.
      </p>

      <div className="retention-ai-guide" aria-label="How to read measured changes">
        <p>
          <b>Point change</b>
          A point is one percentage point of measured audience retention. A
          −6-point item means retention was six percentage points below its
          recent local baseline; it is not a score out of ten.
        </p>
        <p>
          <b>Confidence</b>
          Medium means the supplied transcript or comments provide a plausible
          match. Low means the explanation is more tentative or the nearby
          evidence is limited.
        </p>
        <p>
          <b>Event label</b>
          “Early swipe-risk drop” is a sustained fall within the first 15% of a
          Short, where viewers may still be deciding whether to swipe away.
        </p>
      </div>

      <div className="retention-ai-grid">
        {moments.map((moment, index) => {
          const eventLabel =
            moment.label ??
            (moment.kind === "dip" ? "Retention drop" : "Retention rise");
          const transcriptAvailable = Number.isInteger(
            moment.nearestTranscriptAtSeconds,
          );
          const nearbyComments = moment.timestampedCommentCount ?? 0;

          return (
            <article
              className={`retention-ai-card ${moment.kind}`}
              id={`retention-explanation-${index + 1}`}
              key={`${moment.kind}-${moment.atSeconds}`}
            >
              <header>
                <span className="retention-ai-index">{index + 1}</span>
                <div>
                  <small>{eventLabel}</small>
                  <strong>{timestamp(moment.atSeconds)}</strong>
                </div>
                <span className={`retention-ai-change ${moment.kind}`}>
                  {moment.changePercentagePoints > 0 ? "+" : ""}
                  {moment.changePercentagePoints} pts
                </span>
              </header>

              <p className="retention-ai-hard-evidence">
                <b>{decimal(moment.audienceWatchPercentage, "%")} retained</b>
                <span>
                  Transcript near{" "}
                  {transcriptAvailable
                    ? timestamp(moment.nearestTranscriptAtSeconds)
                    : "unavailable"}
                </span>
                <span>
                  {nearbyComments} nearby timestamped comment
                  {nearbyComments === 1 ? "" : "s"}
                </span>
              </p>

              <div className="retention-ai-copy">
                <p>
                  <b>Evidence context</b>
                  {moment.evidence ??
                    "No AI evidence paraphrase was returned for this measured moment."}
                </p>
                <p>
                  <b>Possible explanation</b>
                  {moment.hypothesis ??
                    "No AI hypothesis was returned. The measured change remains valid."}
                </p>
              </div>

              <footer>
                <span
                  className={`retention-confidence ${
                    moment.confidence ?? "unknown"
                  }`}
                >
                  {moment.confidence
                    ? `${humaniseRetentionLabel(moment.confidence)} confidence`
                    : "Confidence unavailable"}
                </span>
                {moment.eventType ? (
                  <small className="retention-event-label">
                    {humaniseRetentionLabel(moment.eventType)}
                  </small>
                ) : null}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function chartGeometry(points, detailed) {
  const width = detailed ? 1240 : 900;
  const height = 330;
  const left = 54;
  const right = width - 22;
  const top = 24;
  const bottom = height - 42;
  const maximum = Math.max(100, ...points.map((point) => point.audienceWatchPercentage));
  const yMaximum = Math.ceil((maximum + 5) / 10) * 10;
  const x = (ratio) => left + ratio * (right - left);
  const y = (value) => bottom - (value / yMaximum) * (bottom - top);
  return { width, height, left, right, top, bottom, yMaximum, x, y };
}

export function FormatRetentionChart({ retention, durationSeconds, videoFormat }) {
  if (retention.status !== "available") {
    return (
      <article className="retention-card retention-unavailable">
        <p className="eyebrow">Measured retention unavailable</p>
        <h2>Connect the owning channel</h2>
        <p>{retention.reason}</p>
      </article>
    );
  }

  const short = videoFormat.resolved === "short";
  const points = retention.points;
  const g = chartGeometry(points, short);
  const thresholdY = g.y(100);
  const markerRatios = short
    ? [
        { ratio: Math.min(1, 3 / Math.max(1, durationSeconds)), label: "3s" },
        { ratio: 0.5, label: "Midpoint" },
        { ratio: 1, label: "End" },
      ]
    : [
        { ratio: Math.min(1, 30 / Math.max(1, durationSeconds)), label: "30s" },
        { ratio: 0.5, label: "Midpoint" },
        { ratio: 1, label: "End" },
      ];

  const explanationMarkers = (retention.momentExplanations ?? []).map(
    (moment, index) => {
      const point = points.reduce(
        (closest, candidate) =>
          Math.abs(candidate.atSeconds - moment.atSeconds) <
          Math.abs(closest.atSeconds - moment.atSeconds)
            ? candidate
            : closest,
        points[0],
      );
      return { moment, point, index };
    },
  );

  return (
    <article className={`retention-card format-retention-card ${short ? "short-retention-chart" : ""}`}>
      <div className="compact-heading">
        <div>
          <p className="eyebrow">{short ? "Shorts retention" : "Standard-video retention"}</p>
          <h2>Measured audience retention</h2>
        </div>
        {retention.chart?.replayDetected ? <span className="replay-badge">Possible replay activity</span> : null}
      </div>

      <div className="retention-chart-panel format-chart-scroll">
        <svg
          className="retention-chart format-retention-svg"
          viewBox={`0 0 ${g.width} ${g.height}`}
          role="img"
          aria-label="Measured audience retention chart"
        >
          {short ? (
            <>
              <rect
                className="scroll-decision-zone"
                x={g.x(0)}
                y={g.top}
                width={g.x(Math.min(1, 3 / Math.max(1, durationSeconds))) - g.x(0)}
                height={g.bottom - g.top}
              />
              <rect
                className="completion-zone"
                x={g.x(0.9)}
                y={g.top}
                width={g.x(1) - g.x(0.9)}
                height={g.bottom - g.top}
              />
            </>
          ) : null}
          {g.yMaximum > 100 ? (
            <rect
              className="replay-activity-zone"
              x={g.left}
              y={g.top}
              width={g.right - g.left}
              height={thresholdY - g.top}
            />
          ) : null}
          {[0, 50, 100, g.yMaximum].filter((value, index, all) => all.indexOf(value) === index).map((value) => (
            <g key={value}>
              <line x1={g.left} x2={g.right} y1={g.y(value)} y2={g.y(value)} className={value === 100 ? "retention-replay-threshold" : "retention-gridline"} />
              <text x="4" y={g.y(value) + 4} className="retention-axis-label">{value}%</text>
            </g>
          ))}
          {markerRatios.map((marker) => (
            <g key={marker.label}>
              <line x1={g.x(marker.ratio)} x2={g.x(marker.ratio)} y1={g.top} y2={g.bottom} className="retention-format-marker" />
              <text x={g.x(marker.ratio)} y={g.bottom + 29} textAnchor={marker.ratio === 1 ? "end" : marker.ratio === 0 ? "start" : "middle"} className="retention-axis-label">{marker.label}</text>
            </g>
          ))}
          {explanationMarkers.map(({ moment, point, index }) => (
            <g
              className={`retention-ai-chart-marker ${moment.kind}`}
              key={`ai-${moment.kind}-${moment.atSeconds}`}
            >
              <line
                x1={g.x(point.atRatio)}
                x2={g.x(point.atRatio)}
                y1={g.top}
                y2={g.bottom}
                className="retention-ai-marker-line"
              />
              <circle
                cx={g.x(point.atRatio)}
                cy={g.y(point.audienceWatchPercentage)}
                r="9"
                className="retention-ai-marker-point"
              />
              <text
                x={g.x(point.atRatio)}
                y={g.y(point.audienceWatchPercentage) + 3}
                textAnchor="middle"
                className="retention-ai-marker-number"
              >
                {index + 1}
              </text>
              <title>
                {`${index + 1}. ${moment.label ?? moment.kind} at ${timestamp(
                  moment.atSeconds,
                )}: ${moment.changePercentagePoints > 0 ? "+" : ""}${
                  moment.changePercentagePoints
                } points`}
              </title>
            </g>
          ))}
          {points.slice(1).map((point, index) => {
            const previous = points[index];
            const replay = point.audienceWatchPercentage > 100 || previous.audienceWatchPercentage > 100;
            return (
              <line
                key={`${point.atRatio}-${index}`}
                x1={g.x(previous.atRatio)}
                y1={g.y(previous.audienceWatchPercentage)}
                x2={g.x(point.atRatio)}
                y2={g.y(point.audienceWatchPercentage)}
                className={replay ? "retention-replay-line" : "retention-line-segment"}
              />
            );
          })}
          {points.map((point, index) => (
            <circle
              key={`${point.atRatio}-${index}`}
              cx={g.x(point.atRatio)}
              cy={g.y(point.audienceWatchPercentage)}
              r={short ? 3 : 2.5}
              className={point.audienceWatchPercentage > 100 ? "retention-point replay-point" : "retention-point"}
            >
              <title>
                {timestamp(point.atSeconds)} · {point.audienceWatchPercentage}% retention
                {point.audienceWatchPercentage > 100 ? " · possible replay activity" : ""}
              </title>
            </circle>
          ))}
          {points.filter((point) => point.audienceWatchPercentage > 100).slice(0, 4).map((point, index) => (
            <text
              key={`replay-${point.atRatio}-${index}`}
              x={g.x(point.atRatio)}
              y={Math.max(g.top + 12, g.y(point.audienceWatchPercentage) - 9)}
              textAnchor="middle"
              className="replay-activity-label"
            >
              Replay?
            </text>
          ))}
        </svg>
      </div>

      {short ? (
        <div className="format-zone-legend">
          <span className="scroll-zone-key">First 3s scroll-decision zone</span>
          <span className="completion-zone-key">Final 10% completion zone</span>
          <span className="replay-zone-key">Over 100% possible replay activity</span>
        </div>
      ) : null}

      <div className="retention-section-grid">
        <div>
          <span>Strongest section</span>
          <strong>
            {retention.strongestSection
              ? `${timestamp(retention.strongestSection.startSeconds)}–${timestamp(retention.strongestSection.endSeconds)}`
              : "Unavailable"}
          </strong>
          <small>{decimal(retention.strongestSection?.averageRetentionPercentage, "%")} average retention</small>
        </div>
        <div>
          <span>Strongest after initial hook</span>
          <strong>
            {retention.strongestAfterHook
              ? `${timestamp(retention.strongestAfterHook.startSeconds)}–${timestamp(retention.strongestAfterHook.endSeconds)}`
              : "Unavailable"}
          </strong>
          <small>{decimal(retention.strongestAfterHook?.averageRetentionPercentage, "%")} average retention</small>
        </div>
      </div>

      <div className="retention-event-grid">
        {(retention.events ?? []).length ? retention.events.map((event) => (
          <div key={`${event.eventType}-${event.atRatio}`}>
            <span>{event.label}</span>
            <strong>{timestamp(event.atSeconds)}</strong>
            <small>{event.changePercentagePoints > 0 ? "+" : ""}{event.changePercentagePoints} points to {event.audienceWatchPercentage}%</small>
          </div>
        )) : <p>No sustained format-specific change met the detection threshold.</p>}
      </div>

      <RetentionMomentExplanations retention={retention} short={short} />
    </article>
  );
}

export function FormatNextVideoSuggestions({ recommendations, retention, videoFormat }) {
  if (!recommendations) return null;
  const short = videoFormat.resolved === "short";
  const subjects = [...recommendations.subjects].sort((left, right) =>
    left.priority === right.priority ? 0 : left.priority === "most_recommended" ? -1 : 1,
  );
  return (
    <article className="next-video-card format-next-video-card">
      <div className="compact-heading">
        <div>
          <p className="eyebrow">{short ? "Three Short concepts" : "Three standard-video concepts"}</p>
          <h2>Suggestions for your next video</h2>
        </div>
        <span className="recommendation-badge">Concise format plan</span>
      </div>
      <div className="format-subject-grid">
        {subjects.map((subject, index) => (
          <section key={`${subject.subject}-${index}`} className={subject.priority === "most_recommended" ? "recommended" : ""}>
            <span>{subject.priority === "most_recommended" ? "Most recommended" : `Alternative ${index}`}</span>
            <h3>{subject.subject}</h3>
            {short ? (
              <>
                <p><b>First frame and opening line:</b> {subject.angle}</p>
                <p><b>Payoff, duration and target:</b> {subject.rationale}</p>
                <p><b>Loop, captions and alternate hook:</b> {subject.execution}</p>
              </>
            ) : (
              <>
                <p><b>Title directions:</b> {subject.angle}</p>
                <p><b>Thumbnail and discovery position:</b> {subject.rationale}</p>
                <p><b>Opening, structure, duration and risks:</b> {subject.execution}</p>
              </>
            )}
          </section>
        ))}
      </div>
      <div className="format-guidance-strip">
        <section><h3>Carry forward</h3><ul>{recommendations.carryForward.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section><h3>Improve</h3><ul>{recommendations.improvements.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section><h3>Retention tests</h3><ul>{recommendations.retentionGuidance.map((item) => <li key={item}>{item}</li>)}</ul></section>
      </div>
      <p className="recommendation-caveat">{recommendations.caveat}</p>
    </article>
  );
}
