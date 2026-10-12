// Controller: converte HTTP ↔ business logic (cookie inclusi). Nessuna logica né try/catch.
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "./auth.cookies";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/apiResponse";
import { UnauthorizedError } from "../../utils/errors";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = asyncHandler(async (req: Request, res: Response) => {
    const user = await this.service.register(req.body);
    res.status(201).json(ok(user));   // niente token: l'utente fa login
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const { user, accessToken, refreshToken } = await this.service.login(req.body);
    setAuthCookies(res, accessToken, refreshToken);
    res.status(200).json(ok(user));
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (typeof token !== "string" || !token) throw new UnauthorizedError();
    const { accessToken, refreshToken } = await this.service.refresh(token);
    setAuthCookies(res, accessToken, refreshToken);
    res.status(200).json(ok({ refreshed: true }));
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    await this.service.logout(req.cookies?.[ACCESS_COOKIE]);
    clearAuthCookies(res);
    res.status(204).send();
  });

  // req.user è già popolato da authenticate
  me = (req: Request, res: Response): void => {
    const { id, email, role } = req.user!;
    res.status(200).json(ok({ id, email, role }));
  };
}
