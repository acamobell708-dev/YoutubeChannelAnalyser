import crypto from "node:crypto";

import { AppError } from "../errors.js";

const AUTHORISATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";
const OWNER_SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

function randomUrlSafe(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256UrlSafe(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

async function readJson(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error_description ||
      payload?.error?.message ||
      fallbackMessage;
    throw new AppError(message, {
      status: response.status || 502,
      code: "OAUTH_REQUEST_FAILED",
    });
  }
  return payload;
}

export class GoogleOAuthService {
  constructor({
    clientId,
    clientSecret,
    redirectUri,
    sessionSecret,
    fetchImpl = fetch,
    now = () => Date.now(),
  }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.sessionSecret = sessionSecret;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.pendingAuthorisations = new Map();
    this.sessions = new Map();
    this.pendingTtlMs = 10 * 60 * 1000;
    this.sessionTtlMs = 4 * 60 * 60 * 1000;
  }

  get configured() {
    return Boolean(
      this.clientId &&
        this.clientSecret &&
        this.redirectUri &&
        this.sessionSecret?.length >= 32,
    );
  }

  beginAuthorization() {
    this.#assertConfigured();
    this.#removeExpiredRecords();

    const state = randomUrlSafe();
    const codeVerifier = randomUrlSafe(48);
    this.pendingAuthorisations.set(state, {
      codeVerifier,
      expiresAt: this.now() + this.pendingTtlMs,
    });

    const url = new URL(AUTHORISATION_ENDPOINT);
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: OWNER_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: sha256UrlSafe(codeVerifier),
      code_challenge_method: "S256",
    }).toString();

    return { url: url.toString(), state };
  }

  async completeAuthorization({ code, state, expectedState }) {
    this.#assertConfigured();
    this.#removeExpiredRecords();

    if (!code || !state || !expectedState || state !== expectedState) {
      throw new AppError("Google sign-in state validation failed.", {
        status: 400,
        code: "INVALID_OAUTH_STATE",
      });
    }

    const pending = this.pendingAuthorisations.get(state);
    this.pendingAuthorisations.delete(state);
    if (!pending || pending.expiresAt <= this.now()) {
      throw new AppError("Google sign-in has expired. Please try again.", {
        status: 400,
        code: "EXPIRED_OAUTH_STATE",
      });
    }

    const tokenResponse = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
        code,
        code_verifier: pending.codeVerifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const tokenPayload = await readJson(
      tokenResponse,
      "Google token exchange failed.",
    );

    const channels = await this.#fetchOwnedChannels(tokenPayload.access_token);
    const sessionId = randomUrlSafe(48);
    this.sessions.set(sessionId, {
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token || null,
      accessTokenExpiresAt:
        this.now() + Math.max(60, tokenPayload.expires_in || 3600) * 1000,
      expiresAt: this.now() + this.sessionTtlMs,
      channels,
    });

    return {
      sessionId,
      status: this.#publicSessionStatus(this.sessions.get(sessionId)),
    };
  }

  getStatus(sessionId) {
    this.#removeExpiredRecords();
    if (!this.configured) {
      return { configured: false, connected: false, channels: [] };
    }
    const session = sessionId ? this.sessions.get(sessionId) : null;
    return session
      ? this.#publicSessionStatus(session)
      : { configured: true, connected: false, channels: [] };
  }

  async getAccessToken(sessionId) {
    this.#removeExpiredRecords();
    const session = sessionId ? this.sessions.get(sessionId) : null;
    if (!session) return null;
    if (session.accessTokenExpiresAt > this.now() + 60_000) {
      return session.accessToken;
    }
    if (!session.refreshToken) {
      this.sessions.delete(sessionId);
      return null;
    }

    const response = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: session.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await readJson(response, "Google token refresh failed.");
    session.accessToken = payload.access_token;
    session.accessTokenExpiresAt =
      this.now() + Math.max(60, payload.expires_in || 3600) * 1000;
    return session.accessToken;
  }

  async logout(sessionId) {
    const session = sessionId ? this.sessions.get(sessionId) : null;
    if (!session) return;
    this.sessions.delete(sessionId);
    const token = session.refreshToken || session.accessToken;
    await this.fetchImpl(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => undefined);
  }

  #assertConfigured() {
    if (!this.configured) {
      throw new AppError(
        "Google owner sign-in is not configured on this server.",
        { status: 503, code: "GOOGLE_OAUTH_NOT_CONFIGURED" },
      );
    }
  }

  async #fetchOwnedChannels(accessToken) {
    const url = new URL(CHANNELS_ENDPOINT);
    url.search = new URLSearchParams({
      part: "snippet",
      mine: "true",
      maxResults: "50",
      fields: "items(id,snippet/title)",
    }).toString();
    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await readJson(
      response,
      "Unable to verify the signed-in YouTube channel.",
    );
    return (payload.items || []).map((item) => ({
      id: item.id,
      title: item.snippet?.title || "Untitled channel",
    }));
  }

  #publicSessionStatus(session) {
    return {
      configured: true,
      connected: true,
      channels: session.channels,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  #removeExpiredRecords() {
    const currentTime = this.now();
    for (const [state, pending] of this.pendingAuthorisations) {
      if (pending.expiresAt <= currentTime) {
        this.pendingAuthorisations.delete(state);
      }
    }
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt <= currentTime) {
        this.sessions.delete(sessionId);
      }
    }
  }
}
