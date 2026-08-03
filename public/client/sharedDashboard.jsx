import React from "react";

const numberFormatter = new Intl.NumberFormat("en-GB");
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatNumber(value) {
  return Number.isFinite(value) ? numberFormatter.format(value) : "—";
}

export function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : dateFormatter.format(date);
}

export function summaryLines(summary) {
  return String(summary ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export function Header({ activePage }) {
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
          <strong>YT Smart Analysis</strong>
          <small>Find a path forward</small>
        </span>
      </a>
      <nav className="primary-nav" aria-label="Primary navigation">
        <a
          className={activePage === "video" ? "active" : undefined}
          href="/VideoDashboard.html"
          aria-current={activePage === "video" ? "page" : undefined}
        >
          Video Dashboard
        </a>
        <a
          className={activePage === "channel" ? "active" : undefined}
          href="/ChannelDashbaord.html"
          aria-current={activePage === "channel" ? "page" : undefined}
        >
          Channel Dashboard
        </a>
      </nav>
    </header>
  );
}

export function ConfigurationNotice({ status }) {
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

export function ErrorNotice({ message }) {
  if (!message) return null;

  return (
    <div className="error-notice" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <strong>Analysis stopped</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

export function DailyUsageNotice({ usage }) {
  if (!usage?.warning) return null;
  const used = formatNumber(usage.projectedTokens ?? usage.usedTokens);
  const limit = formatNumber(usage.limit);
  return (
    <div
      className={`daily-usage-notice ${usage.locked ? "locked" : ""}`}
      role="status"
    >
      <strong>
        {usage.locked ? "Daily analysis limit reached" : "Daily token warning"}
      </strong>
      <span>
        {used} of {limit} tokens used today ({usage.source}).
        {usage.locked
          ? " New analyses unlock at 00:00 UTC."
          : " New analyses will lock at 200,000 tokens."}
      </span>
    </div>
  );
}

export function OwnerAuthControl({
  ownerAuth,
  returnTo,
  onDisconnect,
  title,
  description,
}) {
  const connectedChannels = ownerAuth?.channels
    ?.map((channel) => channel.title)
    .join(", ");
  return (
    <div className="owner-auth-strip owner-auth-priority">
      <div>
        <span>{title}</span>
        <strong>
          {ownerAuth?.connected
            ? ownerAuth.analyticsAccess === false
              ? "Connected, but Analytics permission needs reconnecting"
              : `Connected: ${connectedChannels || "YouTube owner"}`
            : "Sign in to unlock owner evidence"}
        </strong>
        <p>{description}</p>
      </div>
      {ownerAuth?.connected ? (
        <button type="button" className="auth-action" onClick={onDisconnect}>
          Disconnect
        </button>
      ) : ownerAuth?.configured ? (
        <a
          className="auth-action"
          href={`/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`}
        >
          Connect Google
        </a>
      ) : (
        <span className="auth-unavailable">OAuth not configured</span>
      )}
    </div>
  );
}

export function SanityCard({ sanity }) {
  return (
    <aside className={`sanity-card ${sanity.passed ? "passed" : "failed"}`}>
      <div className="sanity-icon" aria-hidden="true">
        {sanity.passed ? "✓" : "!"}
      </div>
      <div>
        <strong>Sanity check {sanity.passed ? "passed" : "failed"}</strong>
        <p>{sanity.checks.join(" · ")}</p>
      </div>
    </aside>
  );
}

export function Footer() {
  return (
    <footer>
      <span>YT Signal</span>
      <p>
        Public YouTube data via YouTube Data API v3. Interpretation via OpenAI.
      </p>
    </footer>
  );
}
