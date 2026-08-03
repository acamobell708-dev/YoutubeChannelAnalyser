import { AppError } from "../errors.js";

const REPORTS_ENDPOINT = "https://youtubeanalytics.googleapis.com/v2/reports";

function isTimeout(error) {
  return error?.name === "TimeoutError" || error?.code === 23;
}

export class YouTubeAnalyticsClient {
  constructor({ fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async query({
    accessToken,
    ids = "channel==MINE",
    startDate,
    endDate,
    metrics,
    dimensions,
    filters,
    sort,
    maxResults,
    startIndex,
  }) {
    const url = new URL(REPORTS_ENDPOINT);
    url.search = new URLSearchParams({
      ids,
      startDate,
      endDate,
      metrics: metrics.join(","),
      ...(dimensions?.length ? { dimensions: dimensions.join(",") } : {}),
      ...(filters?.length ? { filters: filters.join(";") } : {}),
      ...(sort?.length
        ? { sort: Array.isArray(sort) ? sort.join(",") : String(sort) }
        : {}),
      ...(Number.isInteger(maxResults) ? { maxResults: String(maxResults) } : {}),
      ...(Number.isInteger(startIndex) ? { startIndex: String(startIndex) } : {}),
    }).toString();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new AppError(
            payload?.error?.message ||
              "YouTube Analytics did not return the requested report.",
            {
              status: response.status || 502,
              code: "YOUTUBE_ANALYTICS_REQUEST_FAILED",
            },
          );
          error.providerReason = payload?.error?.errors?.[0]?.reason ?? null;
          throw error;
        }
        const headers = (payload.columnHeaders ?? []).map(
          (header) => header.name,
        );
        return (payload.rows ?? []).map((row) =>
          Object.fromEntries(
            headers.map((header, index) => [header, row[index]]),
          ),
        );
      } catch (error) {
        if (isTimeout(error) && attempt === 0) continue;
        if (isTimeout(error)) {
          throw new AppError(
            "YouTube Analytics did not respond before the extended timeout.",
            {
              status: 504,
              code: "YOUTUBE_ANALYTICS_TIMEOUT",
              cause: error,
            },
          );
        }
        throw error;
      }
    }
  }
}
