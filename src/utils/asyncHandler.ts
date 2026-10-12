// Express 4 ignora la Promise restituita da un handler async: se viene rifiutata nessuno chiama
// next(err) e la richiesta resta appesa. Il wrapper cattura la rejection e la inoltra all'errorHandler.
// (Express 5 lo fa da solo.)
import { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler =
  (fn: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
