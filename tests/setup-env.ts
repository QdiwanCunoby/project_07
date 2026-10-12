// Eseguito da Jest (setupFiles) in ogni file di test, PRIMA degli import: src/config/env.ts e PrismaClient
// leggono process.env al momento dell'import, quindi le variabili devono esserci già.
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

// Niente process.loadEnvFile: nel sandbox di Jest process.env è una COPIA e loadEnvFile scrive su quello reale
// del processo, invisibile ai test. Si fa il parse del file e si assegna a mano.
const vars = parseEnv(fs.readFileSync(path.resolve(__dirname, "../.env.test"), "utf8"));
for (const [key, value] of Object.entries(vars)) {
  // Non sovrascrive variabili già presenti: in CI DATABASE_URL può arrivare dall'ambiente del job
  process.env[key] ??= value;
}

// `npm test` lancia i file in worker paralleli. Se tutti usassero lo stesso schema, il TRUNCATE di una suite
// cancellerebbe i dati di un'altra a metà test. Ogni worker ha quindi il proprio schema Postgres (test_w1, test_w2, ...):
// stesse tabelle, dati separati. Con --runInBand c'è un solo worker → schema test_w1.
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", `test_w${process.env.JEST_WORKER_ID ?? "1"}`);
process.env.DATABASE_URL = url.toString();
