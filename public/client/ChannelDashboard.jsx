import React, { useEffect, useMemo, useState } from "react";
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
  ChannelDevFixtureControl,
  SyntheticFixtureBanner,
} from "./devFixtureControl.jsx";

function humanise(value) {
  return String(value ?? "Unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDecimal(value, suffix = "") {
  return Number.isFinite(value) ? `${formatNumber(value)}${suffix}` : "—";
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "Unknown";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const CHANNEL_VIDEO_TYPE_OPTIONS = [
  {
    id: "all",
    label: "All uploads",
    description: "Mixed-catalogue baseline",
  },
  {
    id: "short",
    label: "Shorts",
    description: "Up to 3 minutes public proxy",
  },
  {
    id: "standard",
    label: "Long-form",
    description: "Over 3 minutes public proxy",
  },
];

function ChannelVideoTypeControl({ value, onChange, disabled = false }) {
  return (
    <fieldset className="channel-video-type-control" disabled={disabled}>
      <legend>Channel analysis lens</legend>
      <div className="channel-video-type-options">
        {CHANNEL_VIDEO_TYPE_OPTIONS.map((option) => (
          <label
            key={option.id}
            className={value === option.id ? "selected" : ""}
          >
            <input
              type="radio"
              name="channel-video-type"
              value={option.id}
              checked={value === option.id}
              onChange={(event) => onChange(event.target.value)}
            />
            <span>
              <b>{option.label}</b>
              <small>{option.description}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function EmptyStage() {
  return (
    <section className="empty-stage channel-empty">
      <div className="channel-bars" aria-hidden="true">
        {[38, 65, 48, 88, 57, 100, 73, 46, 82, 61].map((height, index) => (
          <span key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
      <div>
        <p className="eyebrow">Selected-catalogue public intelligence</p>
        <h2>Compare every upload on fairer terms.</h2>
        <p>
          Choose all uploads, likely Shorts, or likely long-form videos. The
          dashboard filters first, then normalises reach, builds fair cohorts,
          detects outliers, and selects evidence for one bounded AI request.
        </p>
        <ul className="feature-list">
          <li>Views-per-day and engagement percentiles</li>
          <li>Duration and upload-age cohorts</li>
          <li>Momentum, concentration, and outliers</li>
          <li>Evidence-linked next-video directions</li>
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
        <strong>ALL</strong>
      </div>
      <p className="eyebrow">Channel analysis in progress</p>
      <h2>Building fair catalogue comparisons…</h2>
      <p>
        Large channels take longer because the server pages through every
        public upload before calculating cohorts and selecting AI evidence.
      </p>
      <div className="loading-steps" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function ChannelMetric({ label, value, note, tooltip }) {
  return (
    <div
      className="metric hover-help"
      data-tip={tooltip}
      tabIndex={0}
      aria-label={`${label}: ${value}. ${tooltip}`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
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
              <th scope="col">Views/day</th>
              <th scope="col">Engagement</th>
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
                <td>{formatDecimal(video.viewsPerDay)}</td>
                <td>{formatDecimal(video.engagementPer100Views, "%")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function PerformanceOverview({ analysis }) {
  const performance = analysis.performance;
  const cadence = performance.uploadCadence;
  const momentum = analysis.recentMomentum;
  const momentumWindowDays = momentum.windowDays ?? 20;
  const scope = analysis.analysisScope;
  const short = scope?.resolved === "short";
  const engagedViews = analysis.engagedViews;
  const engagedViewsAvailable =
    short && engagedViews?.status === "available";
  return (
    <article className="channel-health-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            Deterministic / {scope?.label ?? "selected catalogue"}
          </p>
          <h2>
            {short
              ? "Shorts engaged-view performance summary"
              : "Channel health summary"}
          </h2>
        </div>
        <span className="sample-badge">No GPT calculation</span>
      </div>
      <p className="channel-health-help">
        Hover or focus each statistic to see how it is calculated and what it means.
      </p>
      <div className="channel-health-grid">
        {short ? (
          <>
            <ChannelMetric
              label="Engaged views"
              value={
                engagedViewsAvailable
                  ? formatNumber(engagedViews.engagedViews)
                  : "Unavailable"
              }
              note={
                engagedViewsAvailable
                  ? "Measured owner YouTube Analytics"
                  : "Connect the channel owner to retrieve this metric"
              }
              tooltip={
                engagedViewsAvailable
                  ? "YouTube defines engaged views as views that continued past the initial seconds. This is the measured aggregate for Shorts in the selected channel and date range."
                  : engagedViews?.reason ?? "Owner YouTube Analytics is required for measured Shorts engaged views."
              }
            />
            <ChannelMetric
              label="Engaged-view share"
              value={
                engagedViewsAvailable
                  ? formatDecimal(engagedViews.engagedViewSharePercent, "%")
                  : "Unavailable"
              }
              note={
                engagedViewsAvailable
                  ? `${formatNumber(engagedViews.engagedViews)} engaged of ${formatNumber(engagedViews.views)} Shorts views`
                  : "Public view count is not a substitute"
              }
              tooltip="Measured engaged views divided by measured Shorts views for the same owner Analytics period. It indicates how many reported Shorts views continued past the initial seconds; it is not completion rate or retention."
            />
          </>
        ) : null}
        <ChannelMetric
          label={short ? "Median public views/day (proxy)" : "Median views/day"}
          value={formatDecimal(performance.medianViewsPerDay)}
          note="Age-normalised lifetime average"
          tooltip="For each upload, lifetime public views are divided by its age in days, using a minimum age of one day. This card shows the catalogue median. Higher means stronger age-normalised reach, not current viewing velocity."
        />
        <ChannelMetric
          label={short ? "Median public interaction" : "Median engagement"}
          value={formatDecimal(performance.medianEngagementPer100Views, "%")}
          note={
            short
              ? "Likes + comments per 100 reported Shorts views"
              : "Likes + comments per 100 views"
          }
          tooltip={short
            ? "For each likely Short: public likes plus public comments are divided by reported public views and multiplied by 100. Reported Shorts views can include starts and replays, so this is not an engaged-view rate and does not measure retention."
            : "For each upload: public likes plus public comments, divided by public views, multiplied by 100. This card shows the selected catalogue median. It measures public interaction density, not watch time or retention."}
        />
        <ChannelMetric
          label={short ? "Top-five public-view share (proxy)" : "Top-five view share"}
          value={formatDecimal(performance.topFiveViewSharePercent, "%")}
          note={humanise(performance.classification)}
          tooltip="The five highest lifetime view counts are added together and divided by total catalogue views. A high share means the channel relies more on a few hits. Hit-driven means at least 80% top-five share or a views/day coefficient of variation of at least 1.5; distributed means no more than 55% share and a coefficient below 1. Fewer than 10 uploads is an insufficient sample."
        />
        <ChannelMetric
          label="Median upload gap"
          value={formatDecimal(cadence.medianGapDays, " days")}
          note={Number.isFinite(cadence.uploadsPer30Days)
            ? `${cadence.uploadsPer30Days} uploads per 30 days`
            : "Insufficient upload history"}
          tooltip="Uploads are ordered by publication date, the day gap between each consecutive upload is calculated, and the median gap is shown. The note converts the observed publishing rate across the catalogue span to uploads per 30 days."
        />
        <ChannelMetric
          label="Above channel median"
          value={formatDecimal(performance.aboveMedianViewsPerDayPercent, "%")}
          note={`${formatNumber(performance.aboveMedianViewsPerDayCount)} uploads by ${short ? "public views/day" : "views/day"}`}
          tooltip="The percentage of analysed uploads whose lifetime-average views/day is strictly higher than the catalogue median. A result near 50% is normal; ties at the median can make it lower."
        />
        <ChannelMetric
          label="Recent momentum"
          value={humanise(momentum.classification)}
          note={Number.isFinite(momentum.medianViewsPerDayChangePercent)
            ? `${momentum.medianViewsPerDayChangePercent}% median ${short ? "public views/day" : "views/day"} change across matched ${momentumWindowDays}-day windows`
            : `At least two uploads in each ${momentumWindowDays}-day window required`}
          tooltip={`Compares the median lifetime-average views/day of uploads published in the most recent ${momentumWindowDays} days with uploads published in the preceding ${momentumWindowDays} days. Improving is at least 20% higher, declining is at least 20% lower, and otherwise it is steady. Each window requires at least two uploads.`}
        />
      </div>
      <p className="analysis-caveat">
        {short
          ? engagedViewsAvailable
            ? "Engaged views above are measured aggregate owner Analytics. Per-video rankings, duration cohorts, outliers and momentum still use public views as a clearly labelled proxy because this channel query does not expose per-video engaged-view history."
            : `Engaged views are unavailable: ${engagedViews?.reason ?? "owner YouTube Analytics was not connected"}. Per-video Shorts comparisons therefore use public views as a proxy and must not be interpreted as engaged views.`
          : scope?.caveat}
      </p>
    </article>
  );
}

function DurationCohorts({ cohorts, scope }) {
  return (
    <article className="cohort-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{scope?.label ?? "Format-relative comparison"}</p>
          <h2>
            {scope?.resolved === "short"
              ? "Shorts public-view proxy by duration"
              : scope?.resolved === "standard"
                ? "Long-form performance by duration"
                : "Performance by duration"}
          </h2>
        </div>
      </div>
      <div className="cohort-grid">
        {cohorts.map((cohort) => (
          <section key={cohort.id}>
            <span>{humanise(cohort.id)}</span>
            <strong>{formatDecimal(cohort.medianViewsPerDay)}</strong>
            <small>
              median {scope?.resolved === "short" ? "public views/day" : "views/day"}
            </small>
            <dl>
              <div><dt>Uploads</dt><dd>{formatNumber(cohort.videoCount)}</dd></div>
              <div><dt>{scope?.resolved === "short" ? "Public-view share" : "View share"}</dt><dd>{formatDecimal(cohort.shareOfViewsPercent, "%")}</dd></div>
              <div><dt>Engagement</dt><dd>{formatDecimal(cohort.medianEngagementPer100Views, "%")}</dd></div>
            </dl>
          </section>
        ))}
      </div>
    </article>
  );
}

function VideoList({ title, description, videos }) {
  return (
    <section className="outlier-list">
      <h3>{title}</h3>
      <p>{description}</p>
      {videos.length ? (
        <ol>
          {videos.slice(0, 5).map((video) => (
            <li key={video.videoId}>
              <a href={video.videoUrl} target="_blank" rel="noreferrer">
                {video.title}
              </a>
              <small>
                {formatDecimal(video.viewsPerDay)} views/day · {formatDecimal(video.engagementPer100Views, "%")} engagement
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <span className="empty-outlier">No upload met this strict threshold.</span>
      )}
    </section>
  );
}

function OutlierGrid({ outliers }) {
  return (
    <article className="outlier-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Percentile combinations</p>
          <h2>Opportunities and warnings</h2>
        </div>
      </div>
      <div className="outlier-grid">
        <VideoList
          title="Strong reach, weak engagement"
          description="Top-quartile views/day but bottom-quartile public engagement."
          videos={outliers.highReachLowEngagement}
        />
        <VideoList
          title="Strong engagement, weak reach"
          description="Potential ideas to repackage: viewers engage when they arrive."
          videos={outliers.lowReachHighEngagement}
        />
        <VideoList
          title="Breakout performers"
          description="Top-decile reach and above its fair duration/age cohort."
          videos={outliers.breakout}
        />
        <VideoList
          title="Fair-peer underperformers"
          description="At least 14 days old and bottom-quartile within a viable cohort."
          videos={outliers.fairPeerUnderperformers}
        />
      </div>
    </article>
  );
}

function EvidenceLinks({ videoIds, catalogueById }) {
  return (
    <span className="evidence-links">
      Evidence: {videoIds.map((videoId, index) => {
        const video = catalogueById.get(videoId);
        return (
          <React.Fragment key={videoId}>
            {index ? ", " : ""}
            {video ? (
              <a href={video.videoUrl} target="_blank" rel="noreferrer">
                {video.title}
              </a>
            ) : (
              videoId
            )}
          </React.Fragment>
        );
      })}
    </span>
  );
}

function AiFindingList({ title, findings, catalogueById }) {
  return (
    <section>
      <h3>{title}</h3>
      {findings.map((finding) => (
        <article key={`${title}-${finding.title}`}>
          <header>
            <strong>{finding.title}</strong>
            <span>{humanise(finding.confidence)} confidence</span>
          </header>
          <p>{finding.finding}</p>
          <p><b>Action:</b> {finding.action}</p>
          <EvidenceLinks
            videoIds={finding.evidenceVideoIds}
            catalogueById={catalogueById}
          />
        </article>
      ))}
    </section>
  );
}

function AiAnalysis({ analysis }) {
  const insight = analysis.performanceAnalysis;
  const synthetic = analysis.fixture?.synthetic === true;
  const catalogueById = useMemo(
    () => new Map(analysis.catalogue.map((video) => [video.videoId, video])),
    [analysis.catalogue],
  );
  if (insight.status !== "available") {
    return (
      <article className="summary-card channel-analysis-card">
        <p className="eyebrow">AI interpretation unavailable</p>
        <h2>Deterministic results are still complete</h2>
        <p className="summary-paragraph">{insight.reason}</p>
      </article>
    );
  }
  return (
    <article className="channel-ai-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {synthetic
              ? "Synthetic / static evidence interpretation"
              : "GPT‑5.4 / supplied evidence only"}
          </p>
          <h2>{insight.summary.headline}</h2>
        </div>
        <span className="sample-badge">{humanise(insight.summary.confidence)} confidence</span>
      </div>
      <p className="channel-ai-summary">{insight.summary.assessment}</p>
      <div className="ai-finding-grid">
        <AiFindingList
          title="Strengths to carry forward"
          findings={insight.strengths}
          catalogueById={catalogueById}
        />
        <AiFindingList
          title="Weaknesses to test"
          findings={insight.weaknesses}
          catalogueById={catalogueById}
        />
      </div>
      <section className="next-directions">
        <h3>Preliminary next-video directions</h3>
        <div>
          {insight.nextVideoDirections.map((direction) => (
            <article key={direction.subject}>
              <span>{humanise(direction.format)}</span>
              <h4>{direction.subject}</h4>
              <p>{direction.rationale}</p>
              <p><b>Hypothesis:</b> {direction.hypothesis}</p>
              <EvidenceLinks
                videoIds={direction.evidenceVideoIds}
                catalogueById={catalogueById}
              />
            </article>
          ))}
        </div>
      </section>
      <aside className="ai-uncertainties">
        <strong>Important uncertainties</strong>
        <ul>{insight.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul>
      </aside>
      <p className="analysis-caveat">
        {synthetic
          ? "Static fixture interpretation; no GPT request or token allowance was used."
          : `One ${humanise(analysis.tokenBudget.mode)} request; ${formatNumber(analysis.tokenBudget.actualTotalTokens)} actual tokens where reported, with a ${formatNumber(analysis.tokenBudget.ceilingTokens)}-token ceiling.`}
      </p>
    </article>
  );
}

const catalogueSorters = {
  publishedAt: (video) => new Date(video.publishedAt).valueOf() || 0,
  viewCount: (video) => video.viewCount,
  viewsPerDay: (video) => video.viewsPerDay ?? -1,
  engagementPer100Views: (video) => video.engagementPer100Views ?? -1,
  fairCohort: (video) => video.cohortPercentiles.viewsPerDay ?? -1,
};

function CatalogueTable({ videos, scope }) {
  const [sortBy, setSortBy] = useState("publishedAt");
  const visible = useMemo(
    () => [...videos]
      .sort((left, right) =>
        catalogueSorters[sortBy](right) - catalogueSorters[sortBy](left) ||
        left.title.localeCompare(right.title),
      ),
    [videos, sortBy],
  );
  return (
    <article className="catalogue-card">
      <div className="section-heading catalogue-heading">
        <div>
          <p className="eyebrow">Sortable / {scope?.label ?? "selected catalogue"}</p>
          <h2>Every upload in this analysis</h2>
        </div>
        <div className="catalogue-controls">
          <label>
            Sort by
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="publishedAt">Newest</option>
              <option value="viewCount">Lifetime views</option>
              <option value="viewsPerDay">Views/day</option>
              <option value="engagementPer100Views">Engagement</option>
              <option value="fairCohort">Fair-cohort percentile</option>
            </select>
          </label>
        </div>
      </div>
      <div className="table-scroll catalogue-scroll">
        <table className="ranking-table catalogue-table">
          <thead>
            <tr>
              <th scope="col">Video</th>
              <th scope="col">Published</th>
              <th scope="col">Duration</th>
              <th scope="col">Views</th>
              <th scope="col">Views/day</th>
              <th scope="col">Engagement</th>
              <th scope="col">Fair cohort</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((video) => (
              <tr key={video.videoId}>
                <th scope="row"><a href={video.videoUrl} target="_blank" rel="noreferrer">{video.title}</a></th>
                <td>{formatDate(video.publishedAt)}</td>
                <td>{formatDuration(video.durationSeconds)}</td>
                <td>{formatNumber(video.viewCount)}</td>
                <td>{formatDecimal(video.viewsPerDay)}</td>
                <td>{formatDecimal(video.engagementPer100Views, "%")}</td>
                <td>{formatDecimal(video.cohortPercentiles.viewsPerDay, "th")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="analysis-caveat">
        {scope?.caveat}
      </p>
    </article>
  );
}

function ResultStage({ analysis }) {
  const short = analysis.analysisScope?.resolved === "short";
  return (
    <section className="result-stage channel-result">
      <SyntheticFixtureBanner fixture={analysis.fixture} />
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
            <a href={analysis.channel.sourceUrl} target="_blank" rel="noreferrer">
              Open channel on YouTube ↗
            </a>
          </div>
        </div>
        <div className="channel-metric-grid">
          <ChannelMetric label="Subscribers" value={formatNumber(analysis.channel.subscriberCount)} />
          <ChannelMetric label="Public channel views" value={formatNumber(analysis.channel.totalViewCount)} />
          <ChannelMetric label="Public videos" value={formatNumber(analysis.channel.videoCount)} />
          <ChannelMetric label="Selected uploads" value={formatNumber(analysis.channel.analysedVideoCount)} />
        </div>
      </article>

      <article className={`channel-scope-card ${analysis.analysisScope.resolved}`}>
        <div>
          <p className="eyebrow">Active analysis lens</p>
          <h2>{analysis.analysisScope.label}</h2>
        </div>
        <div className="channel-scope-facts">
          <span>
            <b>{formatNumber(analysis.analysisScope.includedVideoCount)}</b>
            included
          </span>
          <span>
            <b>{formatNumber(analysis.analysisScope.excludedVideoCount)}</b>
            excluded
          </span>
          <span>
            <b>{humanise(analysis.analysisScope.confidence)}</b>
            classification
          </span>
        </div>
        <p>{analysis.analysisScope.caveat}</p>
      </article>

      <PerformanceOverview analysis={analysis} />
      <DurationCohorts cohorts={analysis.durationCohorts} scope={analysis.analysisScope} />
      <OutlierGrid outliers={analysis.outliers} />
      <AiAnalysis analysis={analysis} />

      <div className="ranking-grid">
        <RankingTable
          title={short ? "Most public views (proxy)" : "Most viewed"}
          description={
            short
              ? "Per-video engaged views are not available in this aggregate channel report, so this ranking uses public lifetime views and public views/day as a proxy."
              : "Lifetime totals for reference; views/day is shown beside them to reveal age bias."
          }
          videos={analysis.topByViews}
          emphasis="Top 10 / lifetime reach"
        />
        <RankingTable
          title="Most commented"
          description="Lifetime public comment totals, with normalised reach and engagement context."
          videos={analysis.topByComments}
          emphasis="Top 10 / interaction"
        />
      </div>

      <CatalogueTable videos={analysis.catalogue} scope={analysis.analysisScope} />
      <SanityCard sanity={analysis.sanity} />
    </section>
  );
}

function App() {
  const [url, setUrl] = useState("");
  const [analysisMode, setAnalysisMode] = useState("economy");
  const [videoType, setVideoType] = useState("all");
  const [dataSource, setDataSource] = useState("real");
  const [configuration, setConfiguration] = useState(null);
  const [ownerAuth, setOwnerAuth] = useState(null);
  const [dailyUsage, setDailyUsage] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const usingFixture = dataSource === "synthetic-channel-short";
  const devFixturesEnabled = configuration?.devFixturesEnabled === true;

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/health").then((response) => response.json()),
      fetch("/api/auth/status").then((response) => response.json()),
      fetch("/api/daily-token-usage").then((response) => response.json()),
    ])
      .then(([healthPayload, authPayload, usagePayload]) => {
        if (!active) return;
        setConfiguration(healthPayload.configuration);
        setOwnerAuth(authPayload.ownerAuth);
        setDailyUsage(usagePayload.usage);
      })
      .catch(() => {
        if (active) {
          setError("The dashboard could not reach its Node.js server. Start the application and refresh this page.");
        }
      });
    return () => { active = false; };
  }, []);

  async function logoutOwner() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOwnerAuth((current) => ({ ...(current || {}), connected: false, channels: [] }));
  }

  function changeDataSource(nextSource) {
    setDataSource(nextSource);
    setAnalysis(null);
    setError("");
    if (nextSource === "synthetic-channel-short") {
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
          ? "/api/dev-fixtures/synthetic-channel-short"
          : "/api/channel-analysis",
        usingFixture
          ? { method: "POST" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: url.trim(),
                analysisMode,
                videoType,
              }),
            },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "The analysis could not be completed.");
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
      <Header activePage="channel" />
      <main>
        <section className="hero channel-hero">
          <div className="hero-copy">
            <p className="eyebrow">Channel intelligence / public + owner Analytics</p>
            <h1>Read the catalogue.<br /><em>Plan the next win.</em></h1>
            <p>
              Choose Shorts, long-form, or the complete public catalogue;
              compare the selected uploads using age- and duration-aware
              metrics. When the owner is connected, the Shorts summary also
              includes measured engaged views from YouTube Analytics before
              producing format-specific next-video directions.
            </p>
          </div>

          <form
            className={`analysis-form ${usingFixture ? "fixture-mode" : ""}`}
            onSubmit={submit}
          >
            <ChannelDevFixtureControl
              enabled={devFixturesEnabled}
              value={dataSource}
              onChange={changeDataSource}
              disabled={loading}
            />
            <label htmlFor="channel-url">
              {usingFixture
                ? "YouTube channel URL (not used by fixture)"
                : "YouTube channel URL"}
            </label>
            <div className="url-control">
              <span aria-hidden="true">▶</span>
              <input
                id="channel-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={
                  usingFixture
                    ? "Synthetic fixture supplies its own Shorts channel"
                    : "https://www.youtube.com/@channel"
                }
                autoComplete="url"
                required={!usingFixture}
                disabled={loading || usingFixture}
              />
            </div>
            {usingFixture ? (
              <div className="dev-fixture-bypass">
                <strong>Shorts channel data is simulated</strong>
                <span>
                  Catalogue metrics, format cohorts, outliers, evidence links
                  and GPT-style findings come from static fixture data.
                </span>
              </div>
            ) : (
              <OwnerAuthControl
                ownerAuth={ownerAuth}
                returnTo="/ChannelDashbaord.html"
                onDisconnect={logoutOwner}
                title="Creator connection"
                description="Connect the channel owner to add measured aggregate Shorts engaged views. Public per-video metrics remain available when owner Analytics is unavailable."
              />
            )}
            <ChannelVideoTypeControl
              value={usingFixture ? "short" : videoType}
              onChange={setVideoType}
              disabled={loading || usingFixture}
            />
            <fieldset className="analysis-mode" disabled={loading || usingFixture}>
              <legend>Analysis depth</legend>
              <label className={analysisMode === "economy" ? "selected" : ""}>
                <input type="radio" name="analysis-mode" value="economy" checked={analysisMode === "economy"} onChange={(event) => setAnalysisMode(event.target.value)} />
                <span><b>Economy</b><small>12 evidence uploads · ≤6,500 tokens</small></span>
              </label>
              <label className={analysisMode === "heavy" ? "selected" : ""}>
                <input type="radio" name="analysis-mode" value="heavy" checked={analysisMode === "heavy"} onChange={(event) => setAnalysisMode(event.target.value)} />
                <span><b>Heavy Analysis</b><small>24 evidence uploads · ≤10,000 tokens</small></span>
              </label>
            </fieldset>
            <div className="form-footer channel-form-footer">
              <button
                type="submit"
                disabled={loading || (!usingFixture && dailyUsage?.locked)}
              >
                {loading
                  ? usingFixture
                    ? "Loading Shorts fixture…"
                    : "Analysing channel…"
                  : usingFixture
                    ? "Load synthetic Shorts channel"
                    : dailyUsage?.locked
                      ? "Daily limit reached"
                      : "Analyse channel"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <small>
              {usingFixture
                ? "Static Shorts catalogue · zero external requests · zero tokens."
                : "Only uploads inside the selected lens enter metrics, cohorts, rankings, outliers and the representative GPT evidence set."}
            </small>
            <span className="form-budget-note">
              {usingFixture
                ? "Synthetic Shorts channel · public-view semantics · no quota usage"
                : `${analysisMode === "heavy" ? "Heavy Analysis · 10,000" : "Economy mode · 6,500"}-token ceiling`}
            </span>
            {!usingFixture ? <DailyUsageNotice usage={dailyUsage} /> : null}
          </form>
        </section>

        <div className="content-shell">
          <ConfigurationNotice status={configuration} />
          <ErrorNotice message={error} />
          {loading ? <LoadingStage /> : analysis ? <ResultStage analysis={analysis} /> : <EmptyStage />}
        </div>
      </main>
      <Footer />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>,
);
