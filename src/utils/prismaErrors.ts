// Riconosce un errore noto di Prisma dal codice (P2002 unique, P2003 foreign key, P2025 record non trovato)
import { Prisma } from "@prisma/client";

export const isPrismaError = (e: unknown, code: string): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;
