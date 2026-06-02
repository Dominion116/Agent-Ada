import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";

const PORT = parseInt(process.env["PORT"] ?? "4000", 10);

const app = createApp();

app.listen(PORT, () => {
  logger.info({ port: PORT }, "Ada API server started");
  logger.info(`Swagger docs at http://localhost:${PORT}/docs`);
});
