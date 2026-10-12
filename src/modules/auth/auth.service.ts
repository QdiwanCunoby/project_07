// Service: logica di autenticazione. Non conosce HTTP né cookie.
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { ConflictError, UnauthorizedError } from "../../utils/errors";
import { IUserRepository } from "./auth.repository";
import {
  AccessTokenPayload, LoginInput, PublicUser, RefreshTokenPayload, RegisterInput, User,
} from "./auth.types";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const BCRYPT_ROUNDS = 12;
const INVALID_CREDENTIALS = "Credenziali non valide";

const toPublic = (u: User): PublicUser => ({ id: u.id, email: u.email, role: u.role, customerId: u.customerId });

export interface TokenPair { accessToken: string; refreshToken: string }

export class AuthService {
  constructor(private readonly users: IUserRepository) {}

  async register(input: RegisterInput): Promise<PublicUser> {
    if (await this.users.findByEmail(input.email)) throw new ConflictError("Email già registrata", "EMAIL_TAKEN");
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    return toPublic(await this.users.createWithCustomer({ ...input, passwordHash }));
  }

  async login(input: LoginInput): Promise<{ user: PublicUser } & TokenPair> {
    const user = await this.users.findByEmail(input.email);
    if (!user) throw new UnauthorizedError(INVALID_CREDENTIALS);

    // bcrypt.compare(plain, hash): l'ordine conta ed entrambi sono `string`, quindi TypeScript non lo controlla
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedError(INVALID_CREDENTIALS);

    return { user: toPublic(user), ...(await this.issueTokens(user)) };
  }

  // Refresh con rotation: il refresh token è monouso. Viene revocato e sostituito da uno nuovo.
  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = this.verifyRefresh(refreshToken);

    const revoked = await this.users.revokeRefreshToken(payload.jti);
    if (!revoked) {
      // Token già usato (o revocato/scaduto/sconosciuto). Se era noto e già usato è un REPLAY: qualcuno ha
      // copiato il cookie. Non sappiamo chi dei due sia l'attaccante → chiudiamo tutte le sessioni dell'utente.
      const stored = await this.users.findRefreshToken(payload.jti);
      if (stored) await this.users.revokeAllRefreshTokens(stored.userId);
      throw new UnauthorizedError("Refresh token non valido");
    }

    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedError("Refresh token non valido");
    return this.issueTokens(user);
  }

  // Logout: revoca i refresh token dell'utente (se l'access token è valido) oltre a cancellare i cookie
  async logout(accessToken: string | undefined): Promise<void> {
    if (!accessToken) return;
    try {
      await this.users.revokeAllRefreshTokens(this.verifyAccessToken(accessToken).sub);
    } catch {
      // access scaduto o non valido: i cookie vengono comunque cancellati dal controller
    }
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const p = jwt.verify(token, env.jwtAccessSecret, { algorithms: ["HS256"] });
      if (typeof p === "string" || typeof p.sub !== "string" || typeof p.email !== "string" || typeof p.role !== "string") {
        throw new Error("payload non valido");
      }
      return p as unknown as AccessTokenPayload;
    } catch {
      throw new UnauthorizedError("Token non valido o scaduto");
    }
  }

  private verifyRefresh(token: string): RefreshTokenPayload {
    try {
      const p = jwt.verify(token, env.jwtRefreshSecret, { algorithms: ["HS256"] });
      if (typeof p === "string" || typeof p.sub !== "string" || typeof p.jti !== "string") throw new Error("payload non valido");
      return p as unknown as RefreshTokenPayload;
    } catch {
      throw new UnauthorizedError("Refresh token non valido o scaduto");
    }
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const access: AccessTokenPayload = { sub: user.id, email: user.email, role: user.role };
    const jti = randomUUID();
    await this.users.saveRefreshToken({
      id: jti, userId: user.id, expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    return {
      accessToken: jwt.sign(access, env.jwtAccessSecret, { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL_SECONDS }),
      refreshToken: jwt.sign({ sub: user.id }, env.jwtRefreshSecret, {
        algorithm: "HS256", expiresIn: REFRESH_TOKEN_TTL_SECONDS, jwtid: jti,
      }),
    };
  }
}
