// Request ID per correlation: ogni richiesta riceve un UUID, salvato in req.id (lo riusano
// pino-http e l'errorHandler nei log) e restituito al client nell'header X-Request-Id.
import { randomUUID } from "node:crypto";
import { Request, Response, NextFunction } from "express";

export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const id = randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
};
