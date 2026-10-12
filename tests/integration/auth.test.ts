// Test del G6 (portati da Vitest a Jest): flusso auth con repository in memoria, nessun DB
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app";
import { InMemoryUserRepository } from "../../src/modules/auth/auth.repository";
import { InMemoryAccountRepository } from "../../src/modules/account/account.repository";
import { InMemoryCustomerRepository } from "../../src/modules/customer/customer.repository";

const EMAIL = "test@liparibank.it";
const PASSWORD = "Password123!";

let users: InMemoryUserRepository;
let app: ReturnType<typeof createApp>;

// Ogni test parte con app e repository nuovi (nessun DB: repository in memoria)
beforeEach(() => {
  users = new InMemoryUserRepository();
  app = createApp({ users, accounts: new InMemoryAccountRepository(), customers: new InMemoryCustomerRepository() });
});

const cookiesOf = (res: request.Response): string[] => (res.headers["set-cookie"] as unknown as string[]) ?? [];
const cookie = (cookies: string[], name: string) => cookies.find(c => c.startsWith(`${name}=`));
// "name=value" senza gli attributi, pronto per l'header Cookie
const pair = (setCookie: string | undefined) => setCookie!.split(";")[0];
const valueOf = (setCookie: string | undefined) => pair(setCookie).split("=")[1];

const register = (email = EMAIL, extra: object = {}) =>
  request(app).post("/api/auth/register").send({ email, password: PASSWORD, ...extra });
const login = (email = EMAIL, password = PASSWORD) => request(app).post("/api/auth/login").send({ email, password });

// register + login → i cookie della sessione
const session = async (email = EMAIL) => {
  await register(email);
  const res = await login(email);
  expect(res.status).toBe(200);
  return cookiesOf(res);
};

describe("Esercizio 5 — flusso completo", () => {
  it("register → 201 senza token, Customer + User creati", async () => {
    const res = await register(EMAIL, { firstName: "Mario", lastName: "Rossi" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: EMAIL, role: "USER" });
    expect(res.body.data.customerId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|eyJ/);
    expect(cookiesOf(res)).toHaveLength(0);
  });

  it("login → 200 e cookie access_token + refresh_token; password hashata bcrypt cost 12", async () => {
    await register();
    const res = await login();
    expect(res.status).toBe(200);
    const cookies = cookiesOf(res);
    expect(cookie(cookies, "access_token")).toBeTruthy();
    expect(cookie(cookies, "refresh_token")).toBeTruthy();
    expect((await users.findByEmail(EMAIL))!.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("GET /api/accounts con cookie → 200, senza cookie → 401 (anche customers e transfers)", async () => {
    const cookies = await session();
    expect((await request(app).get("/api/accounts").set("Cookie", cookies)).status).toBe(200);
    for (const path of ["/api/accounts", "/api/customers", "/api/transfers"]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it("DELETE /api/accounts/:id con ruolo USER → 403; /api/customers/:id idem", async () => {
    const cookies = await session();
    expect((await request(app).delete(`/api/accounts/${randomUUID()}`).set("Cookie", cookies)).status).toBe(403);
    expect((await request(app).delete(`/api/customers/${randomUUID()}`).set("Cookie", cookies)).status).toBe(403);
  });

  it("DELETE come ADMIN supera authorize (404: l'id non esiste, non 403)", async () => {
    await register();
    users.setRole((await users.findByEmail(EMAIL))!.id, "ADMIN");
    const cookies = cookiesOf(await login());
    expect((await request(app).delete(`/api/accounts/${randomUUID()}`).set("Cookie", cookies)).status).toBe(404);
  });

  it("access token scaduto → 401, poi /refresh → nuovi cookie e l'accesso torna possibile", async () => {
    const cookies = await session();
    const user = (await users.findByEmail(EMAIL))!;
    const expired = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_ACCESS_SECRET!,
    );
    const stale = [`access_token=${expired}`, pair(cookie(cookies, "refresh_token"))];
    expect((await request(app).get("/api/accounts").set("Cookie", stale)).status).toBe(401);

    const refreshed = await request(app).post("/api/auth/refresh").set("Cookie", stale);
    expect(refreshed.status).toBe(200);
    const fresh = cookiesOf(refreshed);
    expect(cookie(fresh, "access_token")).toBeTruthy();
    expect(cookie(fresh, "refresh_token")).toBeTruthy();
    expect((await request(app).get("/api/accounts").set("Cookie", fresh)).status).toBe(200);
  });

  it("logout → cookie cancellati → /api/accounts torna 401", async () => {
    const cookies = await session();
    const res = await request(app).post("/api/auth/logout").set("Cookie", cookies);
    expect(res.status).toBe(204);
    const cleared = cookiesOf(res);
    expect(cookie(cleared, "access_token")).toContain("Expires=Thu, 01 Jan 1970");
    expect(cookie(cleared, "refresh_token")).toMatch(/Path=\/api\/auth\/refresh.*Expires=Thu, 01 Jan 1970/);
    // Il browser ora non ha più i cookie
    expect((await request(app).get("/api/accounts")).status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("ritorna { id, email, role }; senza login → 401", async () => {
    const cookies = await session();
    const res = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(["email", "id", "role"]);
    expect(res.body.data.email).toBe(EMAIL);
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
  });
});

describe("Refresh rotation", () => {
  it("il vecchio refresh token è invalidato: riusarlo → 401 e tutte le sessioni dell'utente vengono chiuse", async () => {
    const first = await session();
    const oldRefresh = pair(cookie(first, "refresh_token"));

    const rotated = await request(app).post("/api/auth/refresh").set("Cookie", oldRefresh);
    expect(rotated.status).toBe(200);
    const newRefresh = pair(cookie(cookiesOf(rotated), "refresh_token"));
    expect(newRefresh).not.toBe(oldRefresh);

    // Replay del vecchio token (es. rubato): rifiutato...
    expect((await request(app).post("/api/auth/refresh").set("Cookie", oldRefresh)).status).toBe(401);
    // ...e, per prudenza, anche il token nuovo è stato revocato (reuse detection)
    expect((await request(app).post("/api/auth/refresh").set("Cookie", newRefresh)).status).toBe(401);
  });

  it("senza cookie → 401; un access token non vale come refresh (secret diversi)", async () => {
    const cookies = await session();
    expect((await request(app).post("/api/auth/refresh")).status).toBe(401);
    const asRefresh = `refresh_token=${valueOf(cookie(cookies, "access_token"))}`;
    expect((await request(app).post("/api/auth/refresh").set("Cookie", asRefresh)).status).toBe(401);
  });

  it("dopo il logout il refresh token non è più utilizzabile", async () => {
    const cookies = await session();
    await request(app).post("/api/auth/logout").set("Cookie", cookies);
    expect((await request(app).post("/api/auth/refresh").set("Cookie", cookies)).status).toBe(401);
  });
});

describe("Cookie HttpOnly + SameSite=Lax (+ Secure in produzione)", () => {
  it("flag e path corretti, token mai nel body", async () => {
    await register();
    const res = await login();
    const cookies = cookiesOf(res);
    const access = cookie(cookies, "access_token")!;
    const refresh = cookie(cookies, "refresh_token")!;
    for (const c of [access, refresh]) {
      expect(c).toContain("HttpOnly");
      expect(c).toContain("SameSite=Lax");
    }
    expect(access).toContain("Path=/;");
    expect(access).toContain(`Max-Age=${15 * 60}`);
    expect(refresh).toContain("Path=/api/auth/refresh");
    expect(refresh).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ/);
  });
});

describe("Sicurezza di base", () => {
  it("credenziali errate → 401 con lo stesso messaggio (no user enumeration)", async () => {
    await register();
    const wrong = await login(EMAIL, "Sbagliata1!");
    const unknown = await login("nessuno@liparibank.it");
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it("email duplicata → 409, password debole → 422", async () => {
    await register();
    expect((await register()).status).toBe(409);
    expect((await request(app).post("/api/auth/register").send({ email: "a@b.it", password: "debole" })).status).toBe(422);
  });

  it("JWT firmato con un secret sconosciuto è rifiutato", async () => {
    const forged = jwt.sign({ sub: randomUUID(), email: EMAIL, role: "ADMIN" }, "secret123");
    expect((await request(app).get("/api/accounts").set("Cookie", `access_token=${forged}`)).status).toBe(401);
  });
});

describe("Fail fast sui secret (env.ts)", () => {
  const loadEnv = async (vars: Record<string, string | undefined>) => {
    const saved = { ...process.env };
    for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    try {
      jest.resetModules();
      return await import("../../src/config/env");
    } finally {
      process.env = saved;
    }
  };

  it("senza JWT_ACCESS_SECRET o JWT_REFRESH_SECRET l'app non parte", async () => {
    await expect(loadEnv({ JWT_ACCESS_SECRET: undefined })).rejects.toThrow(/JWT_ACCESS_SECRET/);
    await expect(loadEnv({ JWT_REFRESH_SECRET: undefined })).rejects.toThrow(/JWT_REFRESH_SECRET/);
  });

  it("secret troppo corto o uguali → lancia", async () => {
    await expect(loadEnv({ JWT_ACCESS_SECRET: "corto" })).rejects.toThrow(/troppo corto/);
    const same = "x".repeat(40);
    await expect(loadEnv({ JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same })).rejects.toThrow(/diversi/);
  });
});
