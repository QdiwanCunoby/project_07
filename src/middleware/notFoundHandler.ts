// Catch-all: nessuna route ha gestito la richiesta
import { Request, Response } from "express";
import { fail } from "../utils/apiResponse";

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json(fail("ROUTE_NOT_FOUND", `Route ${req.method} ${req.originalUrl} non esiste`));
};
