// Utility per le integration test sul DB Postgres dedicato (docker-compose.test.yml)
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// prisma migrate deploy sullo schema di questo worker (DATABASE_URL impostato da tests/setup-env.ts).
// Applica solo le migration già scritte, non è interattivo, crea lo schema se manca: è il comando giusto per test e CI.
export function migrateTestDatabase(): void {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "pipe" });
}

// TRUNCATE di tutte le tabelle applicative. CASCADE ignora l'ordine delle FK, RESTART IDENTITY azzera le sequenze.
// Guardia: si rifiuta di girare se il database connesso non è un database di test.
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (!/test/i.test(db)) throw new Error(`Rifiuto di svuotare "${db}": non è un database di test`);
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "transfers", "refresh_tokens", "users", "accounts", "customers" RESTART IDENTITY CASCADE',
  );
}
