import { z } from "zod";
import { Role } from "@prisma/client";

export type UUID = string;
export { Role };

export interface User {
  id: UUID;
  email: string;
  passwordHash: string;
  role: Role;
  customerId: UUID | null;
  createdAt: Date;
}

// Utente esposto al client: mai passwordHash
export type PublicUser = Pick<User, "id" | "email" | "role" | "customerId">;

// Claim dei JWT. Il refresh token ha `jti` = id della riga refresh_tokens (serve alla rotation)
export interface AccessTokenPayload { sub: UUID; email: string; role: Role }
export interface RefreshTokenPayload { sub: UUID; jti: UUID }

export interface StoredRefreshToken { id: UUID; userId: UUID; expiresAt: Date; revokedAt: Date | null }

// ─── Schemi Zod ───
const emailSchema = z
  .string({ message: "Email obbligatoria" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Email non valida" }));

// Password policy: 8-72 caratteri (bcrypt tronca oltre 72 byte), maiuscola, minuscola, cifra, simbolo
const passwordPolicy = z
  .string({ message: "Password obbligatoria" })
  .min(8, { message: "Password: minimo 8 caratteri" })
  .max(72, { message: "Password: massimo 72 caratteri" })
  .regex(/[a-z]/, { message: "Password: serve almeno una minuscola" })
  .regex(/[A-Z]/, { message: "Password: serve almeno una maiuscola" })
  .regex(/\d/, { message: "Password: serve almeno una cifra" })
  .regex(/[^A-Za-z0-9]/, { message: "Password: serve almeno un simbolo" });

const nameSchema = z.string().trim().min(1).max(100).optional();

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordPolicy,
  firstName: nameSchema,
  lastName: nameSchema,
});

// Il login NON applica la policy: non deve rivelare le regole né rifiutare password legacy
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ message: "Password obbligatoria" }).min(1, { message: "Password obbligatoria" }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
