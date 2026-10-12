// Middleware di validazione generico: valida body/query/params con uno schema Zod.
// Se valido sostituisce req[target] con il dato parsato (campi sconosciuti rimossi, default applicati,
// stringhe normalizzate), altrimenti passa un ValidationError (422) all'errorHandler.
import { RequestHandler } from "express";
import { z } from "zod";
import { ValidationError } from "../utils/errors";

type ValidationTarget = "body" | "query" | "params";

export const validate = <T extends z.ZodType>(schema: T, target: ValidationTarget = "body"): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) return next(ValidationError.fromZod(result.error));
    (req as Record<ValidationTarget, unknown>)[target] = result.data;
    next();
  };
