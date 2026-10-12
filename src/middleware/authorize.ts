// Autorizzazione RBAC: factory che accetta i ruoli ammessi. Va DOPO authenticate (serve req.user).
import { RequestHandler } from "express";
import { Role } from "@prisma/client";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";

export const authorize = (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
