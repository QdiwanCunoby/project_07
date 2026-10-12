// Prisma.Decimal → JSON: senza conversione finirebbe come { d, e, s } (struttura interna di decimal.js).
// Lo convertiamo in string con 2 decimali: un number JS perde precisione, un importo bancario non deve mai
// passare per un float.
import { Prisma } from "@prisma/client";

export function serializeDecimals<T>(value: T): T {
  if (value instanceof Prisma.Decimal) return value.toFixed(2) as unknown as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(serializeDecimals) as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeDecimals(v)]),
    ) as T;
  }
  return value;
}
