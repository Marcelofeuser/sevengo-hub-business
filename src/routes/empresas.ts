import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requirePerfil } from "../middleware.js";
import { canAccessEmpresa } from "../authorize.js";
import { ah } from "../asyncHandler.js";

export const empresasRouter = Router();

// Todas as rotas abaixo exigem sessão válida + perfil provisionado.
empresasRouter.use(requireAuth, requirePerfil);

// GET /empresas — consultor vê todas, cliente vê só a própria (mesmo
// comportamento de fetchEmpresas() no AuthContext.tsx original).
empresasRouter.get("/empresas", ah(async (req, res) => {
  const perfil = req.perfil!;
  if (perfil.role === "consultor") {
    const { rows } = await pool.query(`select * from empresas order by nome`);
    res.json(rows);
    return;
  }
  if (!perfil.empresa_id) {
    res.json([]);
    return;
  }
  const { rows } = await pool.query(`select * from empresas where id = $1`, [perfil.empresa_id]);
  res.json(rows);
}));

// POST /empresas — só consultor cria empresa (mesma regra da policy
// "empresas_insert" do schema Supabase original).
empresasRouter.post("/empresas", ah(async (req, res) => {
  const perfil = req.perfil!;
  if (perfil.role !== "consultor") {
    res.status(403).json({ error: "Só consultor pode cadastrar empresas" });
    return;
  }
  const { nome, cidade, regiao, contato } = req.body ?? {};
  if (!nome || typeof nome !== "string") {
    res.status(400).json({ error: "nome é obrigatório" });
    return;
  }
  const { rows } = await pool.query(
    `insert into empresas (nome, cidade, regiao, contato, consultor_id)
     values ($1, $2, $3, $4, $5) returning *`,
    [nome, cidade ?? null, regiao ?? null, contato ?? null, perfil.id],
  );
  res.status(201).json(rows[0]);
}));

// GET /empresas/:id — 404 (não 403) pra não vazar se a empresa existe.
empresasRouter.get("/empresas/:id", ah(async (req, res) => {
  const perfil = req.perfil!;
  if (!canAccessEmpresa(perfil, req.params.id)) {
    res.status(404).json({ error: "Empresa não encontrada" });
    return;
  }
  const { rows } = await pool.query(`select * from empresas where id = $1`, [req.params.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: "Empresa não encontrada" });
    return;
  }
  res.json(rows[0]);
}));

// PATCH /empresas/:id — só consultor edita (pesos do IDP, dados cadastrais).
empresasRouter.patch("/empresas/:id", ah(async (req, res) => {
  const perfil = req.perfil!;
  if (perfil.role !== "consultor") {
    res.status(403).json({ error: "Só consultor pode editar empresas" });
    return;
  }
  const fields = ["nome", "cidade", "regiao", "contato", "peso_estoque", "peso_financeiro", "peso_comercial", "peso_processos"] as const;
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const field of fields) {
    if (field in (req.body ?? {})) {
      params.push(req.body[field]);
      updates.push(`${field} = $${params.length}`);
    }
  }
  if (updates.length === 0) {
    res.status(400).json({ error: "Nenhum campo pra atualizar" });
    return;
  }
  params.push(req.params.id);
  const { rows } = await pool.query(
    `update empresas set ${updates.join(", ")} where id = $${params.length} returning *`,
    params,
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "Empresa não encontrada" });
    return;
  }
  res.json(rows[0]);
}));
