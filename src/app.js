import crypto from "node:crypto";
import path from "node:path";

import express from "express";
import { rateLimit } from "express-rate-limit";

import {
  assertAnalysisConfig,
  configurationStatus,
  PROJECT_ROOT,
} from "./config.js";
import { toPublicError } from "./errors.js";

const OWNER_SESSION_COOKIE = "ytsa_owner_session";
const OAUTH_STATE_COOKIE = "ytsa_oauth_state";

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [
              part.slice(0, separator),
              decodeURIComponent(part.slice(separator + 1)),
            ];
      }),
  );
}

function signSessionId(sessionId, secret) {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${signature}`;
}

function verifySessionCookie(value, secret) {
  if (!value || !secret) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const sessionId = value.slice(0, separator);
  const expected = signSessionId(sessionId, secret);
  if (value.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))
    ? sessionId
    : null;
}

function ownerSessionId(request, config) {
  return verifySessionCookie(
    parseCookies(request)[OWNER_SESSION_COOKIE],
    config.sessionSecret,
  );
}

function registerAnalysisRoute(app, { path, config, analyse, requestData }) {
  app.post(path, async (request, response) => {
    try {
      assertAnalysisConfig(config);
      const analysis = await analyse(requestData(request));
      response.json({ analysis });
    } catch (error) {
      const publicError = toPublicError(error);
      response.status(publicError.status).json(publicError.body);
    }
  });
}

export function createApp({
  config,
  analyseVideo,
  analyseChannel,
  googleOAuthService = null,
  dailyTokenQuota = null,
}) {
  const app = express();
  const publicDirectory = path.join(PROJECT_ROOT, "public");

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Wait a minute and try again.",
        },
      },
    }),
  );
  app.use(
    "/auth",
    rateLimit({
      windowMs: 60_000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      configuration: configurationStatus(config),
    });
  });

  app.get("/api/daily-token-usage", async (_request, response) => {
    response.json({
      usage: dailyTokenQuota
        ? await dailyTokenQuota.getStatus()
        : null,
    });
  });

  app.get("/api/auth/status", (request, response) => {
    const status = googleOAuthService?.getStatus(
      ownerSessionId(request, config),
    ) || {
      configured: false,
      connected: false,
      channels: [],
    };
    response.json({ ownerAuth: status });
  });

  app.get("/auth/google/start", (_request, response) => {
    try {
      if (!googleOAuthService?.configured) {
        response.status(503).json({
          error: {
            code: "GOOGLE_OAUTH_NOT_CONFIGURED",
            message:
              "Google owner sign-in is not configured on this server.",
          },
        });
        return;
      }
      const { url, state } = googleOAuthService.beginAuthorization();
      response.cookie(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.googleOAuthRedirectUri?.startsWith("https://"),
        maxAge: 10 * 60 * 1000,
        path: "/auth/google",
      });
      response.redirect(url);
    } catch (error) {
      const publicError = toPublicError(error);
      response.status(publicError.status).json(publicError.body);
    }
  });

  app.get("/auth/google/callback", async (request, response) => {
    try {
      const cookies = parseCookies(request);
      const result = await googleOAuthService.completeAuthorization({
        code: request.query.code,
        state: request.query.state,
        expectedState: cookies[OAUTH_STATE_COOKIE],
      });
      response.clearCookie(OAUTH_STATE_COOKIE, { path: "/auth/google" });
      response.cookie(
        OWNER_SESSION_COOKIE,
        signSessionId(result.sessionId, config.sessionSecret),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: config.googleOAuthRedirectUri?.startsWith("https://"),
          maxAge: 4 * 60 * 60 * 1000,
          path: "/",
        },
      );
      response.redirect("/VideoDashboard.html?owner=connected");
    } catch {
      response.clearCookie(OAUTH_STATE_COOKIE, { path: "/auth/google" });
      response.redirect("/VideoDashboard.html?owner=error");
    }
  });

  app.post("/api/auth/logout", async (request, response) => {
    const origin = request.get("origin");
    let originMatches = true;
    try {
      originMatches = !origin || new URL(origin).host === request.get("host");
    } catch {
      originMatches = false;
    }
    if (!originMatches) {
      response.status(403).json({
        error: {
          code: "INVALID_ORIGIN",
          message: "The logout request origin was not accepted.",
        },
      });
      return;
    }
    await googleOAuthService?.logout(ownerSessionId(request, config));
    response.clearCookie(OWNER_SESSION_COOKIE, { path: "/" });
    response.json({ ownerAuth: { connected: false } });
  });

  registerAnalysisRoute(app, {
    path: "/api/video-analysis",
    config,
    analyse: analyseVideo,
    requestData: (request) => ({
      url: request.body?.url,
      maxComments: request.body?.maxComments,
      analysisMode: request.body?.analysisMode ?? "economy",
      ownerSessionId: ownerSessionId(request, config),
    }),
  });

  registerAnalysisRoute(app, {
    path: "/api/channel-analysis",
    config,
    analyse: analyseChannel,
    requestData: (request) => ({ url: request.body?.url }),
  });

  app.use(
    express.static(publicDirectory, {
      index: false,
      etag: true,
      cacheControl: false,
      setHeaders: (response, filePath) => {
        if (path.extname(filePath).toLowerCase() === ".html") {
          response.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          );
          response.setHeader("Pragma", "no-cache");
          response.setHeader("Expires", "0");
          return;
        }

        response.setHeader("Cache-Control", "no-cache, must-revalidate");
      },
    }),
  );

  app.get("/", (_request, response) => {
    response.redirect("/VideoDashboard.html");
  });

  app.get("/ChannelDashboard.html", (_request, response) => {
    response.redirect("/ChannelDashbaord.html");
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
      },
    });
  });

  return app;
}
