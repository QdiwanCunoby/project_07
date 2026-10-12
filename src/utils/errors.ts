// Gerarchia di errori applicativi: il Service lancia, l'errorHandler traduce in status HTTP
import { ZodError } from "zod";

export interface FieldError { field: string; message: string }

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }

  // Body della risposta HTTP: mai stack trace o dati interni, solo ciò che serve al client
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined && { details: this.details }),
      },
    };
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) { super(404, "NOT_FOUND", message); }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: FieldError[]) { super(422, "VALIDATION_ERROR", message, details); }

  // ZodError → 422 con un { field, message } per ogni campo non valido
  static fromZod(error: ZodError, message = "Dati non validi"): ValidationError {
    const details = error.issues.map(issue => ({
      field: issue.path.map(String).join(".") || "(root)",
      message: issue.message,
    }));
    return new ValidationError(message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Autenticazione richiesta") { super(401, "UNAUTHORIZED", message); }
}

export class ForbiddenError extends AppError {
  constructor(message = "Operazione non consentita") { super(403, "FORBIDDEN", message); }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") { super(409, code, message); }
}
