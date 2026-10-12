import { Prisma } from "@prisma/client";
import { z } from "zod";

export type UUID = string;

export enum TransferStatus { PENDING = "PENDING", COMPLETED = "COMPLETED", FAILED = "FAILED" }

// Importo come stringa decimale ("100.50"): il JSON number è un float binario (0.1 + 0.2 ≠ 0.3),
// quindi si accetta anche un number ma lo si converte subito in testo e si valida il formato,
// poi diventa un Prisma.Decimal. Da qui in avanti nessun calcolo passa per number.
const amountSchema = z
  .union([z.string(), z.number()])
  .transform(v => String(v).trim())
  .pipe(z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, { message: "amount deve essere un importo positivo con al massimo 2 decimali" }))
  .transform(v => new Prisma.Decimal(v))
  .refine(d => d.gt(0), { message: "amount deve essere maggiore di zero" });

const ibanSchema = (field: string) =>
  z
    .string({ message: `${field} obbligatorio` })
    .trim()
    .toUpperCase()
    .length(27, { message: `${field}: l'IBAN italiano è di 27 caratteri` });

export const createTransferSchema = z
  .object({
    fromIban: ibanSchema("fromIban"),
    toIban: ibanSchema("toIban"),
    amount: amountSchema,
    description: z.string().trim().max(140, { message: "description: massimo 140 caratteri" }).optional(),
  })
  .refine(d => d.fromIban !== d.toIban, { message: "Conto di origine e destinazione devono essere diversi", path: ["toIban"] });

export type CreateTransferDto = z.infer<typeof createTransferSchema>;

export interface Transfer {
  id: UUID;
  fromAccountId: UUID;
  toAccountId: UUID;
  amount: Prisma.Decimal;
  description: string | null;
  status: TransferStatus;
  executedAt: Date | null;
}
