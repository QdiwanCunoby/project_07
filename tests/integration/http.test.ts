// Pipeline HTTP trasversale: health check, 404 catch-all, errori di parsing del body gestiti dall'errorHandler
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app, prisma } from "../../src/app";
import { authCookie } from "../helpers/auth";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Pipeline HTTP", () => {
  it("GET /health → 200 con X-Request-Id nella risposta", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("X-Request-Id inviato dal client viene IGNORATO: l'id di correlazione lo genera sempre il server", async () => {
    // Un id scelto dal client finirebbe nei log: potrebbe falsare la correlazione o iniettare contenuti
    const forged = "id-scelto-dal-client";
    const res = await request(app).get("/health").set("X-Request-Id", forged);
    expect(res.headers["x-request-id"]).not.toBe(forged);
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("route inesistente → 404 ROUTE_NOT_FOUND", async () => {
    const res = await request(app).get("/api/non-esiste").expect(404);
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("JSON malformato → 400 INVALID_JSON", async () => {
    const res = await request(app)
      .post("/api/accounts")
      .set("Cookie", authCookie(randomUUID()))
      .set("Content-Type", "application/json")
      .send('{"iban": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("body oltre 100kb → 413 PAYLOAD_TOO_LARGE", async () => {
    const res = await request(app)
      .post("/api/accounts")
      .set("Cookie", authCookie(randomUUID()))
      .send({ description: "x".repeat(110 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("security header di helmet presenti", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
