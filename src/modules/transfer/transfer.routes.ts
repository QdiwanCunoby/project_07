import { Router } from "express";
import { TransferController } from "./transfer.controller";
import { createTransferSchema } from "./transfer.types";
import { validate } from "../../middleware/validate";

export const createTransferRoutes = (controller: TransferController): Router => {
  const router = Router();

  router.post("/", validate(createTransferSchema), controller.create);   // 201 | 404 | 409 | 422

  return router;
};
