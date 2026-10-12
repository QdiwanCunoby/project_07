// Unit test TransferService. PrismaClient arriva dal costruttore: basta un oggetto con $transaction che esegue
// la callback passandole un `tx` finto con i soli metodi usati dal service (findUnique, updateMany, update).
import { AccountStatus, Prisma, PrismaClient, TransferStatus } from "@prisma/client";
import { TransferService } from "./transfer.service";
import { ITransferRepository } from "./transfer.repository";
import { Transfer } from "./transfer.types";
import { ConflictError, NotFoundError } from "../../utils/errors";

const FROM_IBAN = "IT60X0542811101000000123456";
const TO_IBAN = "IT28W8000000292100645211208";

const accountRow = (id: string, iban: string, balance: string, status: AccountStatus = AccountStatus.ACTIVE) => ({
  id, iban, balance: new Prisma.Decimal(balance), status,
});

const setup = () => {
  const accounts = new Map([
    [FROM_IBAN, accountRow("from-id", FROM_IBAN, "1000.00")],
    [TO_IBAN, accountRow("to-id", TO_IBAN, "500.00")],
  ]);

  const tx = {
    account: {
      findUnique: jest.fn(async ({ where }: { where: { iban: string } }) => accounts.get(where.iban) ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),   // addebito condizionato riuscito
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const repo: jest.Mocked<ITransferRepository> = {
    create: jest.fn(async (_tx, data) => ({ id: "transfer-id", ...data }) as unknown as Transfer),
    findById: jest.fn(),
  };

  const service = new TransferService(prisma as unknown as PrismaClient, repo);
  return { service, prisma, tx, repo, accounts };
};

describe("TransferService.execute", () => {
  it("transfer valido → $transaction, addebito e accredito eseguiti, Transfer salvato COMPLETED", async () => {
    // Arrange
    const { service, prisma, tx, repo } = setup();
    const amount = new Prisma.Decimal("100.00");

    // Act
    const result = await service.execute(FROM_IBAN, TO_IBAN, amount, "Affitto");

    // Assert: tutto dentro UNA transazione
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Addebito condizionato al saldo sufficiente (controllo e scrittura nella stessa UPDATE)
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: { id: "from-id", balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    // Accredito sul conto di destinazione
    expect(tx.account.update).toHaveBeenCalledWith({ where: { id: "to-id" }, data: { balance: { increment: amount } } });
    // Registro del bonifico con lo stesso client della transazione
    expect(repo.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        fromAccountId: "from-id",
        toAccountId: "to-id",
        amount,
        description: "Affitto",
        status: TransferStatus.COMPLETED,
        executedAt: expect.any(Date),
      }),
    );
    expect(result.status).toBe(TransferStatus.COMPLETED);
  });

  it("fondi insufficienti → ConflictError, nessun accredito e nessun Transfer salvato", async () => {
    // Arrange: l'UPDATE condizionata non trova righe con balance >= amount
    const { service, tx, repo } = setup();
    tx.account.updateMany.mockResolvedValue({ count: 0 });

    // Act
    const act = service.execute(FROM_IBAN, TO_IBAN, new Prisma.Decimal("5000.00"));

    // Assert
    await expect(act).rejects.toBeInstanceOf(ConflictError);
    await expect(act).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(tx.account.update).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("conto di origine non trovato → NotFoundError, nessun update", async () => {
    // Arrange
    const { service, tx, accounts } = setup();
    accounts.delete(FROM_IBAN);

    // Act
    const act = service.execute(FROM_IBAN, TO_IBAN, new Prisma.Decimal("10.00"));

    // Assert
    await expect(act).rejects.toBeInstanceOf(NotFoundError);
    await expect(act).rejects.toThrow(FROM_IBAN);
    expect(tx.account.updateMany).not.toHaveBeenCalled();
    expect(tx.account.update).not.toHaveBeenCalled();
  });

  it("conto di destinazione non trovato → NotFoundError", async () => {
    const { service, accounts } = setup();
    accounts.delete(TO_IBAN);
    await expect(service.execute(FROM_IBAN, TO_IBAN, new Prisma.Decimal("10.00"))).rejects.toThrow(TO_IBAN);
  });

  it("conto bloccato → ConflictError ACCOUNT_NOT_ACTIVE, nessun movimento", async () => {
    const { service, tx, accounts } = setup();
    accounts.set(FROM_IBAN, accountRow("from-id", FROM_IBAN, "1000.00", AccountStatus.BLOCKED));

    await expect(service.execute(FROM_IBAN, TO_IBAN, new Prisma.Decimal("10.00")))
      .rejects.toMatchObject({ statusCode: 409, code: "ACCOUNT_NOT_ACTIVE" });
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it("executeFromDto adatta il DTO alla firma di execute (description assente → null)", async () => {
    const { service, repo } = setup();
    await service.executeFromDto({ fromIban: FROM_IBAN, toIban: TO_IBAN, amount: new Prisma.Decimal("1.00") });
    expect(repo.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ description: null }));
  });
});
