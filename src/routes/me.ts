import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware.js";
import { ah } from "../asyncHandler.js";

export const meRouter = Router();

// GET /me — identidade + perfil (role/empresa) + lista de empresas visíveis.
// Substitui o que o AuthContext.tsx do pitstop-consult fazia direto contra
// o Supabase (fetchProfile + fetchEmpresas).
meRouter.get("/me", requireAuth, ah(async (req, res) => {
  const { rows: perfilRows } = await pool.query(
    `select id, nome, role, empresa_id from perfis where id = $1`,
    [req.userId],
  );

  if (perfilRows.length === 0) {
    // Autenticado no auth, mas ainda sem perfil de negócio — o frontend
    // trata isso como "aguardando um consultor te dar acesso", não como erro.
    res.json({ perfil: null, empresas: [] });
    return;
  }

  const perfil = perfilRows[0];

  const { rows: permissoes } = await pool.query(
    `select department_id from permissoes_departamento where user_id = $1`,
    [req.userId],
  );

  let empresas;
  if (perfil.role === "consultor") {
    ({ rows: empresas } = await pool.query(`select * from empresas order by nome`));
  } else if (perfil.empresa_id) {
    ({ rows: empresas } = await pool.query(`select * from empresas where id = $1`, [perfil.empresa_id]));
  } else {
    empresas = [];
  }

  res.json({
    perfil,
    departamentos: permissoes.map((p) => p.department_id),
    empresas,
  });
}));
