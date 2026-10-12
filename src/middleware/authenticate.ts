// Middleware di autenticazione: legge il JWT dal cookie httpOnly access_token e popola req.user.
// Va registrato PRIMA delle route che protegge (Express applica i middleware in ordine di registrazione).
// 401 = "non so chi sei". Il 403 ("so chi sei, ma non puoi") è di middleware/authorize.ts.
import { RequestHandler } from "express";
import { AuthService } from "../modules/auth/auth.service";
import { ACCESS_COOKIE } from "../modules/auth/auth.cookies";
import { UnauthorizedError } from "../utils/errors";

export const createAuthenticate = (service: AuthService): RequestHandler =>
  (req, _res, next) => {
    const token = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== "string" || !token) return next(new UnauthorizedError());
    try {
      const { sub, email, role } = service.verifyAccessToken(token);
      req.user = { id: sub, email, role };
      next();
    } catch {
      next(new UnauthorizedError());
    }
  };
