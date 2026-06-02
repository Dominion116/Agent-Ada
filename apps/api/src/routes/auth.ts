import { Router } from "express";
import { getNonce, verifySiwe } from "../middleware/auth.js";

const router = Router();

/**
 * @swagger
 * /api/auth/nonce:
 *   get:
 *     summary: Get a sign-in nonce for a wallet address
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: wallet
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Nonce issued
 */
router.get("/auth/nonce", getNonce);

/**
 * @swagger
 * /api/auth/verify:
 *   post:
 *     summary: Verify a SIWE signature and receive a session JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *               signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: JWT token issued
 */
router.post("/auth/verify", verifySiwe);

export default router;
