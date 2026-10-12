// Service: bonifico atomico. Tutto o niente: se una qualsiasi operazione dentro la $transaction lancia,
// Prisma fa ROLLBACK e i saldi restano com'erano.
import { AccountStatus, Prisma, PrismaClient, TransferStatus } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../utils/errors";
import { ITransferRepository } from "./transfer.repository";
import { CreateTransferDto, Transfer } from "./transfer.types";

export class TransferService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: ITransferRepository,
  ) {}

  async execute(
    fromIban: string,
    toIban: string,
    amount: Prisma.Decimal,
    description?: string,
  ): Promise<Transfer> {
    return this.prisma.$transaction(async tx => {
      // 1. Entrambi i conti devono esistere
      const [from, to] = await Promise.all([
        tx.account.findUnique({ where: { iban: fromIban } }),
        tx.account.findUnique({ where: { iban: toIban } }),
      ]);
      if (!from) throw new NotFoundError(`Conto di origine ${fromIban} non trovato`);
      if (!to) throw new NotFoundError(`Conto di destinazione ${toIban} non trovato`);

      // Un conto bloccato o chiuso non può muovere né ricevere denaro
      for (const acc of [from, to]) {
        if (acc.status !== AccountStatus.ACTIVE) {
          throw new ConflictError(`Il conto ${acc.iban} non è attivo (${acc.status})`, "ACCOUNT_NOT_ACTIVE");
        }
      }

      // 2. Addebito condizionato: "balance >= amount" è nella stessa UPDATE, quindi controllo e scrittura
      //    sono un'unica operazione atomica. Un check separato (SELECT poi UPDATE) lascerebbe una finestra
      //    in cui due bonifici concorrenti vedono entrambi il saldo sufficiente e lo portano sotto zero.
      const debited = await tx.account.updateMany({
        where: { id: from.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (debited.count === 0) {
        // 409 e non 422: la richiesta è ben formata e valida, è lo STATO della risorsa (saldo) a impedirla
        throw new ConflictError("Saldo insufficiente per eseguire il bonifico", "INSUFFICIENT_FUNDS");
      }

      // 3. Accredito
      await tx.account.update({ where: { id: to.id }, data: { balance: { increment: amount } } });

      // 4. Registro del bonifico (stessa transazione: o esistono tutti e tre i cambiamenti, o nessuno)
      return this.repository.create(tx, {
        fromAccountId: from.id,
        toAccountId: to.id,
        amount,
        description: description ?? null,
        status: TransferStatus.COMPLETED,
        executedAt: new Date(),
      });
    });
  }

  // Adatta il DTO validato dal middleware alla firma execute()
  executeFromDto(dto: CreateTransferDto): Promise<Transfer> {
    return this.execute(dto.fromIban, dto.toIban, dto.amount, dto.description);
  }
}
