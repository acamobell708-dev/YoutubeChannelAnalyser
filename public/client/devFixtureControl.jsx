import React from "react";

export function DevFixtureControl({ enabled, value, onChange, disabled = false }) {
  if (!enabled) return null;

  return (
    <fieldset className="dev-fixture-control" disabled={disabled}>
      <legend>Development data source</legend>
      <div className="dev-source-switch">
        <label className={value === "real" ? "selected" : ""}>
          <input
            type="radio"
            name="development-data-source"
            value="real"
            checked={value === "real"}
            onChange={(event) => onChange(event.target.value)}
          />
          <span>
            <b>Real YouTube analysis</b>
            <small>Normal APIs, OAuth and token usage</small>
          </span>
        </label>
        <label className={value === "synthetic-short" ? "selected" : ""}>
          <input
            type="radio"
            name="development-data-source"
            value="synthetic-short"
            checked={value === "synthetic-short"}
            onChange={(event) => onChange(event.target.value)}
          />
          <span>
            <b>Synthetic Short</b>
            <small>
              Static owner metrics, tags, timestamps, retention and AI explanations
            </small>
          </span>
        </label>
      </div>
      <p>
        Explicit test mode. The synthetic option makes no YouTube, Google,
        OpenAI, OAuth, quota or token request.
      </p>
    </fieldset>
  );
}

export function SyntheticFixtureBanner({ fixture }) {
  if (!fixture?.synthetic) return null;

  return (
    <aside className="synthetic-fixture-banner" role="status">
      <div>
        <span>Development fixture</span>
        <strong>{fixture.label}</strong>
      </div>
      <p>{fixture.scenario}</p>
      <small>{fixture.description}</small>
    </aside>
  );
}
