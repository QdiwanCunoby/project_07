// Configurazione da variabili d'ambiente (con default sensati per lo sviluppo locale)
import fs from "node:fs";

// Carica .env se presente (Node >= 20.12 / 21.7 espone process.loadEnvFile). Nei test no: usano tests/setup.ts
if (process.env.NODE_ENV !== "test" && fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

const NODE_ENVS = ["development", "test", "production"] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

const nodeEnv = (NODE_ENVS as readonly string[]).includes(process.env.NODE_ENV ?? "")
  ? (process.env.NODE_ENV as NodeEnv)
  : "development";

// Secret JWT: nessun default. Se mancano (o sono troppo corti) l'app NON parte (fail fast):
// meglio un crash allo startup che un token firmato con `undefined` in produzione.
const MIN_SECRET_LENGTH = 32;

const requireSecret = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variabile d'ambiente obbligatoria mancante: ${name} (generare con: openssl rand -base64 64)`);
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} troppo corto: servono almeno ${MIN_SECRET_LENGTH} caratteri (generare con: openssl rand -base64 64)`);
  }
  return value;
};

const jwtAccessSecret = requireSecret("JWT_ACCESS_SECRET");
const jwtRefreshSecret = requireSecret("JWT_REFRESH_SECRET");
if (jwtAccessSecret === jwtRefreshSecret) {
  throw new Error("JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devono essere diversi");
}

export const env = {
  nodeEnv,
  port: parseInt(process.env.PORT ?? "3000", 10),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  logLevel: process.env.LOG_LEVEL,   // opzionale: sovrascrive il livello derivato da nodeEnv
  jwtAccessSecret,
  jwtRefreshSecret,
};
