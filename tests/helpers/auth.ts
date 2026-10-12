// JWT test helper per le route protette: firma con JWT_ACCESS_SECRET di .env.test, come farebbe il login.
// authenticate è stateless (verifica solo firma e scadenza): l'utente non deve per forza esistere nel DB.
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

export function generateTestToken(userId: string, role: Role = Role.USER, email = "test@liparibank.it"): string {
  return jwt.sign({ sub: userId, email, role }, process.env.JWT_ACCESS_SECRET!, {
    algorithm: "HS256",
    expiresIn: 15 * 60,
  });
}

// Header Cookie pronto per Supertest: .set("Cookie", authCookie(id, "ADMIN"))
export const authCookie = (userId: string, role: Role = Role.USER): string =>
  `access_token=${generateTestToken(userId, role)}`;
