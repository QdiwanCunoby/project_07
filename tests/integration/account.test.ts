// Integration test /api/accounts: app Express vera + Postgres di test (Supertest non apre porte: usa l'app in memoria)
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app, prisma } from "../../src/app";
import { authCookie } from "../helpers/auth";
import { migrateTestDatabase, truncateAll } from "../helpers/db";

const USER_ID = randomUUID();
const NEW_IBAN = "IT28W8000000292100645211208";

describe("Account API (integration)", () => {
  let ownerId: string;

  beforeAll(() => {
    migrateTestDatabase();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const owner = await prisma.customer.create({
      data: { fiscalCode: "RSSMRA80A01H501U", firstName: "Mario", lastName: "Rossi", email: "mario.rossi@example.com", phone: "+39 333 1234567" },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /api/accounts senza cookie → 401", async () => {
    // Act
    const res = await request(app).post("/api/accounts").send({ ownerId, iban: NEW_IBAN, type: "CHECKING" });

    // Assert
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(await prisma.account.count()).toBe(0);
  });

  it("POST /api/accounts con JWT valido + body corretto → 201, data.iban presente e riga nel DB", async () => {
    // Act
    const res = await request(app)
      .post("/api/accounts")
      .set("Cookie", authCookie(USER_ID))
      .send({ ownerId, iban: NEW_IBAN, type: "SAVINGS", initialBalance: 1500.5 });

    // Assert
    expect(res.status).toBe(201);
    expect(res.body.data.iban).toBe(NEW_IBAN);
    expect(res.body.data).toMatchObject({ ownerId, type: "SAVINGS", balance: "1500.50", status: "ACTIVE" });
    const row = await prisma.account.findUnique({ where: { iban: NEW_IBAN } });
    expect(row!.balance.toFixed(2)).toBe("1500.50");
  });

  it("GET /api/accounts/:id inesistente → 404 con error.code NOT_FOUND", async () => {
    const res = await request(app).get(`/api/accounts/${randomUUID()}`).set("Cookie", authCookie(USER_ID));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("DELETE /api/accounts/:id con role USER → 403 e il conto resta", async () => {
    // Arrange
    const account = await prisma.account.create({ data: { ownerId, iban: NEW_IBAN, type: "CHECKING", balance: "10.00" } });

    // Act
    const res = await request(app).delete(`/api/accounts/${account.id}`).set("Cookie", authCookie(USER_ID, "USER"));

    // Assert
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await prisma.account.count()).toBe(1);
  });

  describe("casi aggiuntivi", () => {
    it("DELETE con role ADMIN → 204 e il conto non esiste più", async () => {
      const account = await prisma.account.create({ data: { ownerId, iban: NEW_IBAN, type: "CHECKING" } });

      await request(app).delete(`/api/accounts/${account.id}`).set("Cookie", authCookie(USER_ID, "ADMIN")).expect(204);

      expect(await prisma.account.findUnique({ where: { id: account.id } })).toBeNull();
    });

    it("GET /api/accounts → 200 con la lista; GET /:id → 200", async () => {
      const account = await prisma.account.create({ data: { ownerId, iban: NEW_IBAN, type: "CHECKING", balance: "42.00" } });

      const list = await request(app).get("/api/accounts").set("Cookie", authCookie(USER_ID)).expect(200);
      expect(list.body.data).toHaveLength(1);
      const one = await request(app).get(`/api/accounts/${account.id}`).set("Cookie", authCookie(USER_ID)).expect(200);
      expect(one.body.data).toMatchObject({ id: account.id, balance: "42.00" });
    });

    it("PUT /api/accounts/:id → 200 e stato aggiornato; id inesistente → 404", async () => {
      const account = await prisma.account.create({ data: { ownerId, iban: NEW_IBAN, type: "CHECKING" } });

      await request(app).put(`/api/accounts/${account.id}`).set("Cookie", authCookie(USER_ID)).send({ status: "BLOCKED" }).expect(200);
      expect((await prisma.account.findUnique({ where: { id: account.id } }))!.status).toBe("BLOCKED");
      await request(app).put(`/api/accounts/${randomUUID()}`).set("Cookie", authCookie(USER_ID)).send({ status: "BLOCKED" }).expect(404);
    });

    it("POST con IBAN duplicato → 409; ownerId inesistente → 409; body non valido → 422", async () => {
      await prisma.account.create({ data: { ownerId, iban: NEW_IBAN, type: "CHECKING" } });
      const post = (body: object) => request(app).post("/api/accounts").set("Cookie", authCookie(USER_ID)).send(body);

      expect((await post({ ownerId, iban: NEW_IBAN, type: "CHECKING" })).status).toBe(409);
      expect((await post({ ownerId: randomUUID(), iban: "IT02A0300203280000400162854", type: "CHECKING" })).status).toBe(409);
      const invalid = await post({ ownerId: "non-un-uuid", iban: "IT00", type: "GOLD" });
      expect(invalid.status).toBe(422);
      // "IT00" viola due regole (lunghezza e formato): due errori sullo stesso campo, si confrontano i campi distinti
      const fields = new Set(invalid.body.error.details.map((d: { field: string }) => d.field));
      expect([...fields].sort()).toEqual(["iban", "ownerId", "type"]);
    });

    it("DELETE di un conto con bonifici registrati → 409 (onDelete: Restrict)", async () => {
      const a = await prisma.account.create({ data: { ownerId, iban: NEW_IBAN, type: "CHECKING", balance: "100.00" } });
      const b = await prisma.account.create({ data: { ownerId, iban: "IT02A0300203280000400162854", type: "CHECKING" } });
      await prisma.transfer.create({ data: { fromAccountId: a.id, toAccountId: b.id, amount: "1.00", status: "COMPLETED" } });

      await request(app).delete(`/api/accounts/${a.id}`).set("Cookie", authCookie(USER_ID, "ADMIN")).expect(409);
    });
  });
});
