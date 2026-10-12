// Route: connette URL → Controller. Le dipendenze arrivano dal composition root (app.ts).
import { RequestHandler, Router } from "express";
import { AuthController } from "./auth.controller";
import { loginSchema, registerSchema } from "./auth.types";
import { validate } from "../../middleware/validate";

export const createAuthRoutes = (controller: AuthController, authenticate: RequestHandler): Router => {
  const router = Router();

  router.post("/register", validate(registerSchema), controller.register);   // 201 | 422 | 409
  router.post("/login",    validate(loginSchema), controller.login);         // 200 + cookie | 422 | 401
  router.post("/refresh",  controller.refresh);                              // 200 + nuovi cookie (rotation) | 401
  router.post("/logout",   controller.logout);                               // 204
  router.get("/me",        authenticate, controller.me);                     // 200 | 401

  return router;
};
