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

function EmptyStage() {
  return (
    <section className="empty-stage channel-empty">
      <div className="channel-bars" aria-hidden="true">
        {[38, 65, 48, 88, 57, 100, 73, 46, 82, 61].map((height, index) => (
          <span key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
      <div>
        <p className="eyebrow">Whole-catalogue public intelligence</p>
        <h2>Compare every upload on fairer terms.</h2>
        <p>
          The dashboard scans the complete public catalogue, normalises reach
          for upload age, compares like-duration and like-age cohorts, and uses
          one bounded AI request to interpret selected evidence.
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
  return (
    <article className="channel-health-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Deterministic / complete catalogue</p>
          <h2>Channel health summary</h2>
        </div>
        <span className="sample-badge">No GPT calculation</span>
      </div>
      <p className="channel-health-help">
        Hover or focus each statistic to see how it is calculated and what it means.
      </p>
      <div className="channel-health-grid">
        <ChannelMetric
          label="Median views/day"
          value={formatDecimal(performance.medianViewsPerDay)}
          note="Age-normalised lifetime average"
          tooltip="For each upload, lifetime public views are divided by its age in days, using a minimum age of one day. This card shows the catalogue median. Higher means stronger age-normalised reach, not current viewing velocity."
        />
        <ChannelMetric
          label="Median engagement"
          value={formatDecimal(performance.medianEngagementPer100Views, "%")}
          note="Likes + comments per 100 views"
          tooltip="For each upload: public likes plus public comments, divided by public views, multiplied by 100. This card shows the catalogue median. It measures public interaction density, not watch time or retention."
        />
        <ChannelMetric
          label="Top-five view share"
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
          note={`${formatNumber(performance.aboveMedianViewsPerDayCount)} uploads by views/day`}
          tooltip="The percentage of analysed uploads whose lifetime-average views/day is strictly higher than the catalogue median. A result near 50% is normal; ties at the median can make it lower."
        />
        <ChannelMetric
          label="Recent momentum"
          value={humanise(momentum.classification)}
          note={Number.isFinite(momentum.medianViewsPerDayChangePercent)
            ? `${momentum.medianViewsPerDayChangePercent}% median views/day change across matched ${momentumWindowDays}-day windows`
            : `At least two uploads in each ${momentumWindowDays}-day window required`}
          tooltip={`Compares the median lifetime-average views/day of uploads published in the most recent ${momentumWindowDays} days with uploads published in the preceding ${momentumWindowDays} days. Improving is at least 20% higher, declining is at least 20% lower, and otherwise it is steady. Each window requires at least two uploads.`}
        />
      </div>
      <p className="analysis-caveat">
        Views/day is a lifetime average since publication, not live velocity.
        Exact Shorts classification and measured retention require owner
        YouTube Analytics in Phase 2.
      </p>
    </article>
  );
}

function DurationCohorts({ cohorts }) {
  return (
    <article className="cohort-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Format-relative comparison</p>
          <h2>Performance by duration</h2>
        </div>
      </div>
      <div className="cohort-grid">
        {cohorts.map((cohort) => (
          <section key={cohort.id}>
            <span>{humanise(cohort.id)}</span>
            <strong>{formatDecimal(cohort.medianViewsPerDay)}</strong>
            <small>median views/day</small>
            <dl>
              <div><dt>Uploads</dt><dd>{formatNumber(cohort.videoCount)}</dd></div>
              <div><dt>View share</dt><dd>{formatDecimal(cohort.shareOfViewsPercent, "%")}</dd></div>
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
          <p className="eyebrow">GPT‑5.4 / supplied evidence only</p>
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
        One {humanise(analysis.tokenBudget.mode)} request; {formatNumber(analysis.tokenBudget.actualTotalTokens)} actual tokens where reported, with a {formatNumber(analysis.tokenBudget.ceilingTokens)}-token ceiling.
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

function CatalogueTable({ videos }) {
  const [formatFilter, setFormatFilter] = useState("all");
  const [sortBy, setSortBy] = useState("publishedAt");
  const visible = useMemo(
    () => videos
      .filter((video) => formatFilter === "all" || video.formatGroup === formatFilter)
      .sort((left, right) =>
        catalogueSorters[sortBy](right) - catalogueSorters[sortBy](left) ||
        left.title.localeCompare(right.title),
      ),
    [videos, formatFilter, sortBy],
  );
  return (
    <article className="catalogue-card">
      <div className="section-heading catalogue-heading">
        <div>
          <p className="eyebrow">Sortable / whole catalogue</p>
          <h2>Every analysed upload</h2>
        </div>
        <div className="catalogue-controls">
          <label>
            Format
            <select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="up_to_3_minutes">Up to 3 minutes</option>
              <option value="over_3_minutes">Over 3 minutes</option>
            </select>
          </label>
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
        “Up to 3 minutes” is a duration proxy, not an assertion that YouTube
        classified the upload as a Short.
      </p>
    </article>
  );
}

function ResultStage({ analysis }) {
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
            <a href={analysis.channel.sourceUrl} target="_blank" rel="noreferrer">
              Open channel on YouTube ↗
            </a>
          </div>
        </div>
        <div className="channel-metric-grid">
          <ChannelMetric label="Subscribers" value={formatNumber(analysis.channel.subscriberCount)} />
          <ChannelMetric label="Channel views" value={formatNumber(analysis.channel.totalViewCount)} />
          <ChannelMetric label="Public videos" value={formatNumber(analysis.channel.videoCount)} />
          <ChannelMetric label="Videos analysed" value={formatNumber(analysis.channel.analysedVideoCount)} />
        </div>
      </article>

      <PerformanceOverview analysis={analysis} />
      <DurationCohorts cohorts={analysis.durationCohorts} />
      <OutlierGrid outliers={analysis.outliers} />
      <AiAnalysis analysis={analysis} />

      <div className="ranking-grid">
        <RankingTable
          title="Most viewed"
          description="Lifetime totals for reference; views/day is shown beside them to reveal age bias."
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

      <CatalogueTable videos={analysis.catalogue} />
      <SanityCard sanity={analysis.sanity} />
    </section>
  );
}

function App() {
  const [url, setUrl] = useState("");
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

  async function submit(event) {
    event.preventDefault();
    setError("");
    setAnalysis(null);
    setLoading(true);
    try {
      const response = await fetch("/api/channel-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), analysisMode }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "The analysis could not be completed.");
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
      <Header activePage="channel" />
      <main>
        <section className="hero channel-hero">
          <div className="hero-copy">
            <p className="eyebrow">Channel intelligence / public data</p>
            <h1>Read the catalogue.<br /><em>Plan the next win.</em></h1>
            <p>
              Compare every public upload using age- and duration-aware
              metrics, diagnose reach-versus-engagement outliers, and turn the
              strongest evidence into bounded next-video directions.
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
            <OwnerAuthControl
              ownerAuth={ownerAuth}
              returnTo="/ChannelDashbaord.html"
              onDisconnect={logoutOwner}
              title="Creator connection"
              description="The reusable owner sign-in is ready for Phase 2 Analytics. Phase 1 calculations below use public data only."
            />
            <fieldset className="analysis-mode" disabled={loading}>
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
              <button type="submit" disabled={loading || dailyUsage?.locked}>
                {loading ? "Analysing channel…" : dailyUsage?.locked ? "Daily limit reached" : "Analyse channel"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <small>All uploads are calculated locally; only the representative evidence set is sent in one GPT request.</small>
            <span className="form-budget-note">
              {analysisMode === "heavy" ? "Heavy Analysis · 10,000" : "Economy mode · 6,500"}-token ceiling
            </span>
            <DailyUsageNotice usage={dailyUsage} />
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
