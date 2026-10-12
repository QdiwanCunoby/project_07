// Error handler centralizzato: 4 argomenti → Express lo riconosce come error middleware
import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError, ValidationError } from "../utils/errors";
import { logger } from "../utils/logger";
import { fail } from "../utils/apiResponse";

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const reqId = req.id;   // correlation: la stessa id è nell'header X-Request-Id della risposta

  // Errori applicativi lanciati da Service / validate
  if (err instanceof AppError) {
    logger.warn({ reqId, code: err.code, statusCode: err.statusCode }, err.message);
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // ZodError da un .parse() fuori dal middleware validate
  if (err instanceof ZodError) {
    const validationError = ValidationError.fromZod(err);
    logger.warn({ reqId, details: validationError.details }, "Validazione fallita");
    res.status(validationError.statusCode).json(validationError.toJSON());
    return;
  }

  // Body JSON malformato o troppo grande (sollevati da express.json())
  const httpErr = err as { type?: string };
  if (httpErr.type === "entity.parse.failed") {
    logger.warn({ reqId }, "Body JSON non valido");
    res.status(400).json(fail("INVALID_JSON", "Body JSON non valido"));
    return;
  }
  if (httpErr.type === "entity.too.large") {
    logger.warn({ reqId }, "Body oltre il limite");
    res.status(413).json(fail("PAYLOAD_TOO_LARGE", "Body oltre il limite di 100kb"));
    return;
  }

  // Errore inatteso: stack trace solo nei log, al client un messaggio generico
  logger.error({ reqId, err }, "Errore non gestito");
  res.status(500).json(fail("INTERNAL_ERROR", "Errore interno del server"));
};
