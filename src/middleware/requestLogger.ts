// Logging HTTP con pino-http: una riga per richiesta completata, con reqId, status e responseTime.
import { IncomingMessage } from "node:http";
import pinoHttp from "pino-http";
import { logger } from "../utils/logger";

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage) => req.id,   // riusa l'id generato dal middleware requestId
  // Della response basta lo status: gli header di sicurezza di helmet sono sempre uguali
  serializers: { res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }) },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
});
