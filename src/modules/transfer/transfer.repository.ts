// Repository Transfer: i metodi di scrittura ricevono il client della transazione ($transaction),
// così il Service decide quali operazioni appartengono alla stessa unità atomica.
import { Prisma, PrismaClient } from "@prisma/client";
import { Transfer } from "./transfer.types";

export interface ITransferRepository {
  create(tx: Prisma.TransactionClient, data: Prisma.TransferUncheckedCreateInput): Promise<Transfer>;
  findById(id: string): Promise<Transfer | null>;
}

export class PrismaTransferRepository implements ITransferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(tx: Prisma.TransactionClient, data: Prisma.TransferUncheckedCreateInput): Promise<Transfer> {
    return tx.transfer.create({ data }) as Promise<Transfer>;
  }

  findById(id: string): Promise<Transfer | null> {
    return this.prisma.transfer.findUnique({ where: { id } }) as Promise<Transfer | null>;
  }
}
