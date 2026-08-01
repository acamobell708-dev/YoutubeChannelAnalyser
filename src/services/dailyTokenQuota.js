import { AppError } from "../errors.js";

export const DAILY_TOKEN_WARNING = 150_000;
export const DAILY_TOKEN_LIMIT = 200_000;

function utcDayKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function utcDayStartSeconds(time) {
  const date = new Date(time);
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      1_000,
  );
}

function tokenTotal(payload) {
  return (payload.data ?? []).flatMap((bucket) => bucket.results ?? []).reduce(
    (total, result) =>
      total +
      Number(result.input_tokens ?? 0) +
      Number(result.output_tokens ?? 0),
    0,
  );
}

/**
 * Server-side daily guard. An optional OpenAI Admin key supplements the
 * counter with organisation-wide Usage API data; the local counter remains
 * the reliable guard for requests made by this application.
 */
export class DailyTokenQuota {
  constructor({ adminKey = "", fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    this.adminKey = adminKey;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.day = null;
    this.localTokens = 0;
    this.reservedTokens = 0;
  }

  resetIfNewDay() {
    const day = utcDayKey(this.now());
    if (day !== this.day) {
      this.day = day;
      this.localTokens = 0;
      this.reservedTokens = 0;
    }
  }

  async organisationTokens() {
    if (!this.adminKey || typeof this.fetchImpl !== "function") return null;
    const now = this.now();
    const params = new URLSearchParams({
      start_time: String(utcDayStartSeconds(now)),
      end_time: String(Math.floor(now / 1_000)),
      bucket_width: "1d",
    });
    try {
      const response = await this.fetchImpl(
        `https://api.openai.com/v1/organization/usage/completions?${params}`,
        { headers: { Authorization: `Bearer ${this.adminKey}` } },
      );
      if (!response.ok) return null;
      return tokenTotal(await response.json());
    } catch {
      return null;
    }
  }

  async getStatus() {
    this.resetIfNewDay();
    const organisationTokens = await this.organisationTokens();
    const usedTokens = Math.max(this.localTokens, organisationTokens ?? 0);
    const projectedTokens = usedTokens + this.reservedTokens;
    return {
      date: this.day,
      usedTokens,
      projectedTokens,
      warning: projectedTokens >= DAILY_TOKEN_WARNING,
      locked: projectedTokens >= DAILY_TOKEN_LIMIT,
      warningThreshold: DAILY_TOKEN_WARNING,
      limit: DAILY_TOKEN_LIMIT,
      source: organisationTokens === null ? "this application" : "OpenAI organisation usage",
    };
  }

  async reserve(maximumTokens) {
    if (!Number.isInteger(maximumTokens) || maximumTokens <= 0) {
      throw new TypeError("A positive whole-token reservation is required.");
    }
    const status = await this.getStatus();
    if (status.usedTokens + this.reservedTokens + maximumTokens > DAILY_TOKEN_LIMIT) {
      throw new AppError(
        "The 200,000-token daily limit has been reached or this analysis would exceed it. New analyses unlock at 00:00 UTC.",
        { status: 429, code: "DAILY_TOKEN_LIMIT_REACHED" },
      );
    }
    this.reservedTokens += maximumTokens;
    let settled = false;
    return {
      settle: (actualTokens = null) => {
        if (settled) return;
        settled = true;
        this.resetIfNewDay();
        this.reservedTokens = Math.max(0, this.reservedTokens - maximumTokens);
        // If the model failed after starting, retain the full reservation: the
        // provider may still have billed tokens even though no usage was returned.
        const charge = Number.isFinite(actualTokens) && actualTokens >= 0
          ? Math.ceil(actualTokens)
          : maximumTokens;
        this.localTokens += charge;
      },
    };
  }
}
