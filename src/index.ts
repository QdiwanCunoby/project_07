// Entry point — avvia il server HTTP
import { app, prisma } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

const server = app.listen(env.port, () => {
  logger.info(
    { nodeEnv: env.nodeEnv, corsOrigin: env.corsOrigin, logLevel: logger.level },
    `🏦 LipariBank API su http://localhost:${env.port}`,
  );
});

// Graceful shutdown: SIGTERM (Docker) / SIGINT (Ctrl+C) → smetti di accettare richieste, poi chiudi il pool DB
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    logger.info({ signal }, "Shutdown in corso");
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
