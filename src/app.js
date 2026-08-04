import path from "node:path";

import express from "express";
import { rateLimit } from "express-rate-limit";

import {
  assertAnalysisConfig,
  configurationStatus,
  PROJECT_ROOT,
} from "./config.js";
import { toPublicError } from "./errors.js";
import { ownerSessionId } from "./auth/sessionCookies.js";
import { registerGoogleAuthRoutes } from "./routes/googleAuthRoutes.js";
import { createSyntheticShortAnalysis } from "./fixtures/syntheticShortAnalysis.js";

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

  if (config.devFixturesEnabled) {
    app.post("/api/dev-fixtures/synthetic-short", (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Dev-Fixture", "synthetic-short");
      response.json({ analysis: createSyntheticShortAnalysis() });
    });
  }

  registerGoogleAuthRoutes(app, { config, googleOAuthService });

  registerAnalysisRoute(app, {
    path: "/api/video-analysis",
    config,
    analyse: analyseVideo,
    requestData: (request) => ({
      url: request.body?.url,
      maxComments: request.body?.maxComments,
      analysisMode: request.body?.analysisMode ?? "economy",
      videoType: request.body?.videoType ?? "auto",
      ownerSessionId: ownerSessionId(request, config),
    }),
  });

  registerAnalysisRoute(app, {
    path: "/api/channel-analysis",
    config,
    analyse: analyseChannel,
    requestData: (request) => ({
      url: request.body?.url,
      analysisMode: request.body?.analysisMode ?? "economy",
      ownerSessionId: ownerSessionId(request, config),
    }),
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
