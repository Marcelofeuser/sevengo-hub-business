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

// Mesma lista de 12 tabelas empresa_id-scoped que resources.ts expõe —
// mantida em paralelo aqui porque createScopedRouter não exporta a lista, e
// duplicar 12 strings é mais simples/direto que reestruturar o módulo só
// pra isso. Se uma tabela nova entrar em resources.ts, precisa entrar aqui
// também (senão o DELETE de empresa deixa lixo órfão pra trás).
const TABELAS_ESCOPADAS = [
  "diagnosticos",
  "checklist_itens",
  "estoque_itens",
  "lancamentos_financeiros",
  "oficinas_parceiras",
  "orcamentos",
  "pops",
  "plano_90_dias",
  "contas_pagar",
  "contas_receber",
  "notas_fiscais",
  "obrigacoes_fiscais",
] as const;

// DELETE /empresas/:id — só consultor. Cascata manual (schema não tem FK ON
// DELETE CASCADE — corte limpo da migração não recriou essas constraints)
// numa transação: apaga as 12 tabelas escopadas, depois os `perfis` de
// clientes vinculados a essa empresa (perde sentido um perfil "cliente" sem
// empresa — quem quiser manter a conta, usa desvincular em vez de excluir a
// empresa), e por último a própria empresa. Não mexe na tabela `user` do
// better-auth — a conta de login do cliente continua existindo, só perde o
// vínculo com essa empresa (podendo ser reconvidado pra outra no futuro).
empresasRouter.delete("/empresas/:id", ah(async (req, res) => {
  const perfil = req.perfil!;
  if (perfil.role !== "consultor") {
    res.status(403).json({ error: "Só consultor pode excluir empresas" });
    return;
  }
  const empresaId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows: empresaRows } = await client.query(`select id from empresas where id = $1 for update`, [empresaId]);
    if (empresaRows.length === 0) {
      await client.query("rollback");
      res.status(404).json({ error: "Empresa não encontrada" });
      return;
    }

    for (const tabela of TABELAS_ESCOPADAS) {
      await client.query(`delete from ${tabela} where empresa_id = $1`, [empresaId]);
    }
    await client.query(`delete from perfis where empresa_id = $1`, [empresaId]);
    await client.query(`delete from empresas where id = $1`, [empresaId]);

    await client.query("commit");
    res.status(204).end();
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
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
