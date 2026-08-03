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

function RankSummary({ videoFormat, metrics }) {
  const ranking = metrics.formatRelativeRanking;
  if (!ranking) return null;
  const formatLabel = videoFormat.resolved === "short" ? "Short proxy cohort" : "Standard-video proxy cohort";
  return (
    <div className="format-ranking">
      <div>
        <span>{formatLabel}</span>
        <strong>
          {Number.isInteger(ranking.views?.rank)
            ? `#${ranking.views.rank} of ${ranking.views.outOf} by views`
            : "View rank unavailable"}
        </strong>
      </div>
      <div>
        <span>Comment standing</span>
        <strong>
          {Number.isInteger(ranking.comments?.rank)
            ? `#${ranking.comments.rank} of ${ranking.comments.outOf}`
            : "Unavailable"}
        </strong>
      </div>
      <p>{ranking.caveat}</p>
    </div>
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
        help="Owner engagedViews divided by owner-reported Shorts views, multiplied by 100."
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
          <span>Selected tags</span>
          <strong className={`tag-verdict ${packaging.tagUsefulness}`}>
            {String(packaging.tagUsefulness ?? "unknown").replaceAll("_", " ")}
          </strong>
          <p>{packaging.tagAssessment}</p>
        </div>
        {video.tags.length ? (
          <div className="tag-list">
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
              <span>{row.label}</span>
              <strong>{Number.isFinite(row.sharePercent) ? `${row.sharePercent}%` : "—"}</strong>
              <small>{formatNumber(row.value)} {discovery.metric === "engagedViews" ? "engaged views" : "views"}</small>
            </div>
          ))}
        </div>
      ) : <p className="discovery-unavailable">{discovery?.reason ?? "Connect the owner account to retrieve traffic-source data."}</p>}
      {!short ? (
        <aside className="thumbnail-reach-note">
          <strong>Thumbnail impressions and click-through rate</strong>
          <p>{discovery?.thumbnailReach?.reason ?? "Unavailable in this targeted Analytics request."}</p>
        </aside>
      ) : null}
    </article>
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
