import type { NextFunction, Request, Response } from "express";
import { pool } from "./db.js";
import { getSession } from "./session.js";

export interface Perfil {
  id: string;
  nome: string;
  role: "consultor" | "cliente";
  empresa_id: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      perfil?: Perfil;
    }
  }
}

/** Exige uma sessão válida no auth service. Preenche req.userId. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await getSession(req.header("authorization") ?? undefined);
  if (!session) {
    res.status(401).json({ error: "Sessão inválida ou ausente" });
    return;
  }
  req.userId = session.user.id;
  next();
}

/**
 * Exige que o usuário autenticado já tenha um `perfil` (role + empresa_id)
 * no business-api. Um usuário do better-auth sem perfil ainda não foi
 * provisionado por um consultor — não é um 404 genérico, é "aguardando
 * provisionamento".
 */
export async function requirePerfil(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: "Sessão inválida ou ausente" });
    return;
  }
  const { rows } = await pool.query<Perfil>(
    `select id, nome, role, empresa_id from perfis where id = $1`,
    [req.userId],
  );
  if (rows.length === 0) {
    res.status(403).json({ error: "Usuário autenticado mas sem perfil provisionado" });
    return;
  }
  req.perfil = rows[0];
  next();
}
