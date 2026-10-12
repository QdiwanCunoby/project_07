// Integration test del bonifico end-to-end: POST /api/transfers → $transaction Prisma → Postgres di test
import request from "supertest";
import bcrypt from "bcrypt";
import { app, prisma } from "../../src/app";
import { PrismaTransferRepository } from "../../src/modules/transfer/transfer.repository";
import { authCookie } from "../helpers/auth";
import { migrateTestDatabase, truncateAll } from "../helpers/db";

const FROM_IBAN = "IT60X0542811101000000123456";
const TO_IBAN = "IT28W8000000292100645211208";

describe("Transfer API (integration, end-to-end)", () => {
  let adminCookie: string;

  beforeAll(() => {
    migrateTestDatabase();
  });

  // Seed: 2 conti (1000 e 500) + un utente ADMIN
  beforeEach(async () => {
    await truncateAll(prisma);
    const owner = await prisma.customer.create({
      data: { fiscalCode: "RSSMRA80A01H501U", firstName: "Mario", lastName: "Rossi", email: "mario.rossi@example.com", phone: "+39 333 1234567" },
    });
    await prisma.account.createMany({
      data: [
        { ownerId: owner.id, iban: FROM_IBAN, type: "CHECKING", balance: "1000.00" },
        { ownerId: owner.id, iban: TO_IBAN, type: "SAVINGS", balance: "500.00" },
      ],
    });
    const admin = await prisma.user.create({
      data: { email: "admin@liparibank.it", passwordHash: await bcrypt.hash("Admin123!", 4), role: "ADMIN" },
    });
    adminCookie = authCookie(admin.id, "ADMIN");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const balances = async () => {
    const rows = await prisma.account.findMany({ where: { iban: { in: [FROM_IBAN, TO_IBAN] } } });
    const of = (iban: string) => rows.find(r => r.iban === iban)!.balance.toFixed(2);
    return { from: of(FROM_IBAN), to: of(TO_IBAN) };
  };

  const transfer = (body: object) => request(app).post("/api/transfers").set("Cookie", adminCookie).send(body);

  it("POST /api/transfers valido → 201, saldi aggiornati a 900 e 600, Transfer COMPLETED registrato", async () => {
    // Act
    const res = await transfer({ fromIban: FROM_IBAN, toIban: TO_IBAN, amount: "100.00", description: "Rimborso" });

    // Assert
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ amount: "100.00", status: "COMPLETED", description: "Rimborso" });
    expect(await balances()).toEqual({ from: "900.00", to: "600.00" });
    expect(await prisma.transfer.count({ where: { status: "COMPLETED" } })).toBe(1);
  });

  it("POST /api/transfers con amount > saldo → 409 INSUFFICIENT_FUNDS, saldi invariati, nessun Transfer", async () => {
    // Act
    const res = await transfer({ fromIban: FROM_IBAN, toIban: TO_IBAN, amount: "1000.01" });

    // Assert
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_FUNDS");
    expect(await balances()).toEqual({ from: "1000.00", to: "500.00" });
    expect(await prisma.transfer.count()).toBe(0);
  });

  it("rollback Prisma: errore DOPO addebito e accredito → 500 e saldi invariati (tutto o niente)", async () => {
    // Arrange: l'ultimo passo della transazione (registrazione del Transfer) fallisce
    const create = jest.spyOn(PrismaTransferRepository.prototype, "create").mockRejectedValue(new Error("DB down"));

    // Act
    const res = await transfer({ fromIban: FROM_IBAN, toIban: TO_IBAN, amount: "250.00" });

    // Assert: addebito e accredito erano già stati eseguiti dentro la $transaction, il ROLLBACK li ha annullati
    expect(create).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(await balances()).toEqual({ from: "1000.00", to: "500.00" });
  });

  it("l'intero saldo si può trasferire (balance >= amount, non >)", async () => {
    await transfer({ fromIban: FROM_IBAN, toIban: TO_IBAN, amount: 1000 }).expect(201);
    expect(await balances()).toEqual({ from: "0.00", to: "1500.00" });
  });

  it("conto di origine inesistente → 404; stesso conto → 422; senza login → 401", async () => {
    expect((await transfer({ fromIban: "IT02A0300203280000400162854", toIban: TO_IBAN, amount: "1.00" })).status).toBe(404);
    expect((await transfer({ fromIban: FROM_IBAN, toIban: FROM_IBAN, amount: "1.00" })).status).toBe(422);
    await request(app).post("/api/transfers").send({ fromIban: FROM_IBAN, toIban: TO_IBAN, amount: "1.00" }).expect(401);
    expect(await balances()).toEqual({ from: "1000.00", to: "500.00" });
  });

  it("conto di destinazione chiuso → 409 ACCOUNT_NOT_ACTIVE, saldi invariati", async () => {
    await prisma.account.update({ where: { iban: TO_IBAN }, data: { status: "CLOSED" } });

    const res = await transfer({ fromIban: FROM_IBAN, toIban: TO_IBAN, amount: "10.00" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACCOUNT_NOT_ACTIVE");
    expect(await balances()).toEqual({ from: "1000.00", to: "500.00" });
  });
});
