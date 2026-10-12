// Integration test /api/customers su Postgres di test
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app, prisma } from "../../src/app";
import { authCookie } from "../helpers/auth";
import { migrateTestDatabase, truncateAll } from "../helpers/db";

const USER = authCookie(randomUUID(), "USER");
const ADMIN = authCookie(randomUUID(), "ADMIN");

const mario = { fiscalCode: "RSSMRA80A01H501U", firstName: "Mario", lastName: "Rossi", email: "mario.rossi@example.com", phone: "+39 333 1234567" };
const giulia = { fiscalCode: "VRDGLI90B41F205Z", firstName: "Giulia", lastName: "Verdi", email: "giulia.verdi@example.com", phone: "+39 347 7654321" };

describe("Customer API (integration)", () => {
  beforeAll(() => {
    migrateTestDatabase();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const create = (body: object) => request(app).post("/api/customers").set("Cookie", USER).send(body);

  it("POST → 201 (codice fiscale normalizzato maiuscolo), GET lista e GET /:id → 200", async () => {
    const res = await create({ ...mario, fiscalCode: "rssmra80a01h501u" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ fiscalCode: "RSSMRA80A01H501U", status: "ACTIVE" });

    const list = await request(app).get("/api/customers").set("Cookie", USER).expect(200);
    expect(list.body.data).toHaveLength(1);
    await request(app).get(`/api/customers/${res.body.data.id}`).set("Cookie", USER).expect(200);
  });

  it("GET /:id inesistente → 404; senza login → 401", async () => {
    expect((await request(app).get(`/api/customers/${randomUUID()}`).set("Cookie", USER)).body.error.code).toBe("NOT_FOUND");
    await request(app).get("/api/customers").expect(401);
  });

  it("codice fiscale duplicato → 409 (service); email duplicata → 409 (vincolo unique del DB, P2002)", async () => {
    await create(mario).expect(201);
    expect((await create({ ...giulia, fiscalCode: mario.fiscalCode })).status).toBe(409);
    expect((await create({ ...giulia, email: mario.email })).status).toBe(409);
    expect(await prisma.customer.count()).toBe(1);
  });

  it("body non valido → 422 con i campi in errore", async () => {
    const res = await create({ ...mario, fiscalCode: "ABC", phone: "x" });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(expect.arrayContaining(["fiscalCode", "phone"]));
  });

  it("PUT → 200; id inesistente → 404; email già di un altro cliente → 409", async () => {
    const { body } = await create(mario).expect(201);
    await create(giulia).expect(201);

    const updated = await request(app).put(`/api/customers/${body.data.id}`).set("Cookie", USER).send({ status: "INACTIVE", lastName: "Bianchi" });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ status: "INACTIVE", lastName: "Bianchi" });

    await request(app).put(`/api/customers/${randomUUID()}`).set("Cookie", USER).send({ lastName: "X" }).expect(404);
    await request(app).put(`/api/customers/${body.data.id}`).set("Cookie", USER).send({ email: giulia.email }).expect(409);
  });

  it("DELETE: USER → 403; ADMIN → 204; inesistente → 404; cliente con conti → 409", async () => {
    const { body: a } = await create(mario).expect(201);
    const { body: b } = await create(giulia).expect(201);
    await prisma.account.create({ data: { ownerId: b.data.id, iban: "IT60X0542811101000000123456", type: "CHECKING" } });

    await request(app).delete(`/api/customers/${a.data.id}`).set("Cookie", USER).expect(403);
    await request(app).delete(`/api/customers/${a.data.id}`).set("Cookie", ADMIN).expect(204);
    await request(app).delete(`/api/customers/${a.data.id}`).set("Cookie", ADMIN).expect(404);
    await request(app).delete(`/api/customers/${b.data.id}`).set("Cookie", ADMIN).expect(409);   // onDelete: Restrict
  });
});
