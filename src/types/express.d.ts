// Declaration merging: aggiunge `user` a Express.Request (popolato da middleware/authenticate.ts)
import { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: Role };
    }
  }
}

export {};
