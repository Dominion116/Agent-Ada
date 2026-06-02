import { Router } from "express";
import { getDb } from "../lib/db.js";

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Liveness probe
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get("/health", async (_req, res) => {
  try {
    // Light DB ping
    const db = getDb();
    await db.from("users").select("id").limit(1);
    res.json({ status: "ok", version: "1.0.0", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", db: "unreachable" });
  }
});

export default router;
