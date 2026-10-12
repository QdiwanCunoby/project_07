// I repository in memoria sono i test double usati dalle suite senza DB (auth.test.ts):
// devono comportarsi come quelli Prisma, altrimenti quei test verificherebbero qualcosa di falso.
import { InMemoryAccountRepository } from "../../src/modules/account/account.repository";
import { InMemoryCustomerRepository } from "../../src/modules/customer/customer.repository";
import { AccountStatus, AccountType } from "../../src/modules/account/account.types";
import { CustomerStatus } from "../../src/modules/customer/customer.types";

describe("InMemoryAccountRepository", () => {
  const dto = { ownerId: "owner-1", iban: "IT60X0542811101000000123456", type: AccountType.CHECKING, initialBalance: 100 };

  it("create → saldo formattato a 2 decimali, ACTIVE; findById / findByIban / findAll", async () => {
    const repo = new InMemoryAccountRepository();
    const created = await repo.create(dto);

    expect(created).toMatchObject({ balance: "100.00", status: AccountStatus.ACTIVE, iban: dto.iban });
    expect(await repo.findById(created.id)).toEqual(created);
    expect(await repo.findByIban(dto.iban)).toEqual(created);
    expect(await repo.findById("x")).toBeNull();
    expect(await repo.findByIban("x")).toBeNull();
    expect(await repo.findAll()).toHaveLength(1);
  });

  it("update ignora i campi undefined (non cancella i valori esistenti); id inesistente → null", async () => {
    const repo = new InMemoryAccountRepository();
    const created = await repo.create(dto);

    const updated = await repo.update(created.id, { status: AccountStatus.BLOCKED, type: undefined });

    expect(updated).toMatchObject({ status: AccountStatus.BLOCKED, type: AccountType.CHECKING });
    expect(await repo.update("x", { status: AccountStatus.CLOSED })).toBeNull();
  });

  it("delete → true la prima volta, false se non esiste", async () => {
    const repo = new InMemoryAccountRepository();
    const created = await repo.create(dto);

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.findAll()).toHaveLength(0);
  });
});

describe("InMemoryCustomerRepository", () => {
  const dto = { fiscalCode: "rssmra80a01h501u", firstName: "Mario", lastName: "Rossi", email: "mario@example.com", phone: "+39 333 1234567" };

  it("create normalizza il codice fiscale; findByFiscalCode è case-insensitive", async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await repo.create(dto);

    expect(created).toMatchObject({ fiscalCode: "RSSMRA80A01H501U", status: CustomerStatus.ACTIVE });
    expect(await repo.findByFiscalCode("rssmra80a01h501u")).toEqual(created);
    expect(await repo.findById(created.id)).toEqual(created);
    expect(await repo.findById("x")).toBeNull();
    expect(await repo.findByFiscalCode("XXXXXX00X00X000X")).toBeNull();
    expect(await repo.findAll()).toHaveLength(1);
  });

  it("update ignora i campi undefined; delete true/false; id inesistente → null", async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await repo.create(dto);

    expect(await repo.update(created.id, { lastName: "Bianchi", email: undefined })).toMatchObject({ lastName: "Bianchi", email: dto.email });
    expect(await repo.update("x", { lastName: "X" })).toBeNull();
    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
  });
});
