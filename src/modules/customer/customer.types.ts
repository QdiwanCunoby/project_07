import { z } from "zod";

export type UUID = string;

export enum CustomerStatus { ACTIVE = "ACTIVE", INACTIVE = "INACTIVE" }

export interface Customer {
  id: UUID;
  fiscalCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: CustomerStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Codice fiscale persona fisica: 6 lettere, 2 cifre, 1 lettera, 2 cifre, 1 lettera, 3 cifre, 1 lettera
const FISCAL_CODE_REGEX = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/;
// Prefisso internazionale opzionale, poi 6-15 cifre (spazi ammessi)
const PHONE_REGEX = /^\+?\d[\d ]{5,18}$/;

const nameSchema = (field: string) =>
  z.string({ message: `${field} obbligatorio` }).trim().min(1, { message: `${field} obbligatorio` }).max(100, { message: `${field}: massimo 100 caratteri` });

// ─── Schemi Zod ───
export const createCustomerSchema = z.object({
  fiscalCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(FISCAL_CODE_REGEX, { message: "Codice fiscale non valido (16 caratteri, es. RSSMRA80A01H501U)" }),
  firstName: nameSchema("firstName"),
  lastName: nameSchema("lastName"),
  email: z.email({ message: "Email non valida" }),
  phone: z.string().trim().regex(PHONE_REGEX, { message: "Telefono non valido (es. +39 333 1234567)" }),
});

// Tutti i campi opzionali; il codice fiscale è immutabile, lo status si gestisce solo in update.
export const updateCustomerSchema = createCustomerSchema
  .omit({ fiscalCode: true })
  .extend({ status: z.enum(CustomerStatus) })
  .partial()
  .refine(dto => Object.keys(dto).length > 0, { message: "Specifica almeno un campo da aggiornare" });

export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;
