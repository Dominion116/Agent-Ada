import { Router } from "express";
import { requireCronSecret } from "../middleware/auth.js";
import { runAgentScan } from "../agent/loop.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * @swagger
 * /api/cron/scan:
 *   post:
 *     summary: Trigger a yield scan for all opted-in wallets
 *     tags: [Cron]
 *     security:
 *       - CronSecret: []
 *     responses:
 *       200:
 *         description: Scan complete
 */
router.post("/cron/scan", requireCronSecret, async (_req, res, next) => {
  try {
    logger.info("Cron scan starting");
    const result = await runAgentScan();
    logger.info(result, "Cron scan complete");
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
