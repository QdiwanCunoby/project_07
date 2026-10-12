// Logger strutturato Pino con redaction dei dati sensibili (PCI-DSS / GDPR)
import pino from "pino";
import { env, NodeEnv } from "../config/env";

const LEVEL_BY_ENV: Record<NodeEnv, pino.LevelWithSilent> = {
  development: "debug",
  test: "silent",
  production: "info",
};

// I log restano archiviati a lungo e li leggono più persone dei dati di produzione:
// credenziali, codice fiscale e dati di carta non devono mai finirci.
// Il wildcard "*.campo" copre un solo livello di annidamento.
export const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.fiscalCode",
  "*.pan",
  "*.cvv",
];

export const logger = pino({
  level: env.logLevel ?? LEVEL_BY_ENV[env.nodeEnv],
  redact: { paths: redactPaths, censor: "[REDACTED]" },
  // In sviluppo output leggibile; in produzione JSON su stdout (lo raccoglie l'infrastruttura)
  ...(env.nodeEnv === "development" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" },
    },
  }),
});
