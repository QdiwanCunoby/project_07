// Repository utenti + refresh token: interfaccia, implementazione Prisma e implementazione in memoria (test)
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Role, StoredRefreshToken, User, UUID } from "./auth.types";

export interface NewUser { email: string; passwordHash: string; firstName?: string; lastName?: string }

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: UUID): Promise<User | null>;
  // Crea Customer + User in modo atomico
  createWithCustomer(data: NewUser): Promise<User>;

  saveRefreshToken(token: { id: UUID; userId: UUID; expiresAt: Date }): Promise<void>;
  // Revoca atomica: true solo se il token esisteva ed era ancora attivo (è il "one-time use" della rotation)
  revokeRefreshToken(id: UUID): Promise<boolean>;
  revokeAllRefreshTokens(userId: UUID): Promise<void>;
  findRefreshToken(id: UUID): Promise<StoredRefreshToken | null>;
}

// Il Customer richiede fiscalCode (unique) e phone: alla registrazione non li abbiamo → placeholder da completare.
// "TMP" + 12 hex = 15 caratteri (la colonna è VarChar(16)).
const placeholderFiscalCode = () => "TMP" + randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
const NOT_AVAILABLE = "N/D";

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: UUID) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // Nested write: Prisma esegue Customer + User in un'unica transazione
  createWithCustomer(data: NewUser) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        customer: {
          create: {
            fiscalCode: placeholderFiscalCode(),
            firstName: data.firstName ?? NOT_AVAILABLE,
            lastName: data.lastName ?? NOT_AVAILABLE,
            email: data.email,
            phone: NOT_AVAILABLE,
          },
        },
      },
    });
  }

  async saveRefreshToken(token: { id: UUID; userId: UUID; expiresAt: Date }) {
    await this.prisma.refreshToken.create({ data: token });
  }

  async revokeRefreshToken(id: UUID) {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    return count === 1;
  }

  async revokeAllRefreshTokens(userId: UUID) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  findRefreshToken(id: UUID) {
    return this.prisma.refreshToken.findUnique({ where: { id } });
  }
}

export class InMemoryUserRepository implements IUserRepository {
  private readonly users = new Map<UUID, User>();
  private readonly tokens = new Map<UUID, StoredRefreshToken>();

  async findByEmail(email: string) {
    return [...this.users.values()].find(u => u.email === email) ?? null;
  }

  async findById(id: UUID) {
    return this.users.get(id) ?? null;
  }

  async createWithCustomer(data: NewUser) {
    const user: User = {
      id: randomUUID(), email: data.email, passwordHash: data.passwordHash,
      role: Role.USER, customerId: randomUUID(), createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  // Solo per i test: promuove un utente (nel DB reale lo fa un admin/seed)
  setRole(id: UUID, role: Role) {
    const user = this.users.get(id);
    if (user) user.role = role;
  }

  async saveRefreshToken(token: { id: UUID; userId: UUID; expiresAt: Date }) {
    this.tokens.set(token.id, { ...token, revokedAt: null });
  }

  async revokeRefreshToken(id: UUID) {
    const t = this.tokens.get(id);
    if (!t || t.revokedAt || t.expiresAt <= new Date()) return false;
    t.revokedAt = new Date();
    return true;
  }

  async revokeAllRefreshTokens(userId: UUID) {
    for (const t of this.tokens.values()) if (t.userId === userId && !t.revokedAt) t.revokedAt = new Date();
  }

  async findRefreshToken(id: UUID) {
    return this.tokens.get(id) ?? null;
  }
}
