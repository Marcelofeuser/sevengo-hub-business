import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 não captura rejeição de Promise em handler async — um erro
 * (ex: violação de constraint do Postgres) vira unhandled rejection e
 * derruba o processo inteiro (visto na prática: POST /checklist_itens sem
 * `concluido` no corpo, coluna NOT NULL, gerou 502 + reinício do container).
 * Todo handler async passa por aqui, que encaminha o erro pro
 * errorHandler central em server.ts em vez de deixar escapar.
 */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
