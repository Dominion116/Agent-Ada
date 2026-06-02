import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Agent Ada API",
      version: "1.0.0",
      description:
        "Autonomous stablecoin treasury agent on Celo. " +
        "Yields and execute endpoints are metered via x402.",
    },
    servers: [{ url: process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:4000" }],
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        CronSecret: { type: "apiKey", in: "header", name: "X-Cron-Secret" },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ["./src/routes/*.ts"],
});
