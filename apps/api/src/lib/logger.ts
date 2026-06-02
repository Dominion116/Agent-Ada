import pino from "pino";

const opts: pino.LoggerOptions =
  process.env["NODE_ENV"] !== "production"
    ? {
        level: process.env["LOG_LEVEL"] ?? "info",
        transport: { target: "pino-pretty", options: { colorize: true, ignore: "pid,hostname" } },
      }
    : { level: process.env["LOG_LEVEL"] ?? "info" };

export const logger = pino(opts);
