import express from "express";
import helmet from "helmet";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import type { RequestHandler } from "express";
import { logger } from "./lib/logger.js";
import { swaggerSpec } from "./lib/swagger.js";
import { errorHandler } from "./middleware/error-handler.js";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import agentRouter from "./routes/agent.js";
import cronRouter from "./routes/cron.js";
import a2aRouter from "./routes/a2a.js";

export function createApp() {
  const app = express();

  // ── Security and parsing ────────────────────────────────────
  app.use(helmet());
  app.use(cors({
    origin: process.env["FRONTEND_URL"] ?? "http://localhost:3000",
    credentials: true,
    exposedHeaders: ["X-PAYMENT-RESPONSE"],
  }));
  app.use(express.json({ limit: "256kb" }));

  // ── Request logging ─────────────────────────────────────────
  const requestLogger: RequestHandler = (req, _res, next) => {
    logger.info({ method: req.method, path: req.path }, "request");
    next();
  };
  app.use(requestLogger);

  // ── Swagger UI ──────────────────────────────────────────────
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/openapi.json", (_req, res) => res.json(swaggerSpec));

  // ── Routes ──────────────────────────────────────────────────
  app.use("/api", healthRouter);
  app.use("/api", authRouter);
  app.use("/api", agentRouter);
  app.use("/api", cronRouter);

  // A2A (Agent2Agent): /.well-known/agent-card.json and POST /a2a live at the
  // origin root, not under /api, per RFC 8615.
  app.use(a2aRouter);

  // ── 404 handler ─────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // ── Global error handler ─────────────────────────────────────
  app.use(errorHandler);

  return app;
}
