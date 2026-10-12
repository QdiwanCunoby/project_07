import { Request, Response } from "express";
import { TransferService } from "./transfer.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/apiResponse";
import { serializeDecimals } from "../../utils/decimalSerializer";

export class TransferController {
  constructor(private readonly service: TransferService) {}

  // req.body è già validato da validate(createTransferSchema): amount è un Prisma.Decimal
  create = asyncHandler(async (req: Request, res: Response) => {
    const transfer = await this.service.executeFromDto(req.body);
    res.status(201).json(ok(serializeDecimals(transfer)));
  });
}
