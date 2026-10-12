// Opzioni dei cookie di sessione.
//
// SameSite in 3 righe:
//  - Strict: il cookie non parte mai nelle richieste cross-site (nemmeno cliccando un link da un'altra pagina → l'utente appare "sloggato" al primo click).
//  - Lax:    parte solo nelle navigazioni top-level GET cross-site, NON in POST/fetch/iframe cross-site → blocca il CSRF classico senza rompere i link in ingresso.
//  - None:   parte sempre (richiede Secure): serve solo per embed/SSO cross-site, espone al CSRF.
// Per LipariBank Lax è il default: protezione CSRF sulle operazioni che cambiano stato (bonifici, cambio password) mantenendo
// usabili i link da email/PEC verso l'home banking.
import { CookieOptions, Response } from "express";
import { env } from "../../config/env";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "./auth.service";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
export const REFRESH_COOKIE_PATH = "/api/auth/refresh";

const base = (): CookieOptions => ({
  httpOnly: true,                          // invisibile a document.cookie (mitiga il furto via XSS)
  secure: env.nodeEnv === "production",    // solo HTTPS in produzione
  sameSite: "lax",
});

const accessOptions = (): CookieOptions => ({ ...base(), maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000, path: "/" });
// path ristretto: il refresh token viaggia solo verso l'endpoint di refresh, non verso il resto dell'app
const refreshOptions = (): CookieOptions => ({ ...base(), maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000, path: REFRESH_COOKIE_PATH });

export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
  res.cookie(ACCESS_COOKIE, accessToken, accessOptions());
  res.cookie(REFRESH_COOKIE, refreshToken, refreshOptions());
};

// clearCookie cancella solo se path (e flag) coincidono con quelli del Set-Cookie originale
export const clearAuthCookies = (res: Response): void => {
  const { maxAge: _a, ...access } = accessOptions();
  const { maxAge: _r, ...refresh } = refreshOptions();
  res.clearCookie(ACCESS_COOKIE, access);
  res.clearCookie(REFRESH_COOKIE, refresh);
};
