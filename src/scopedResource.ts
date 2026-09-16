import { Router } from "express";
import { pool } from "./db.js";
import { requireAuth, requirePerfil } from "./middleware.js";
import { canAccessEmpresa } from "./authorize.js";
import { ah } from "./asyncHandler.js";

interface ScopedResourceConfig {
  /** Nome da tabela e do path da rota (ex: "pops" -> /pops). */
  resource: string;
  /** Colunas aceitas em POST/PATCH, além de empresa_id. */
  fields: string[];
  /**
   * Se true, só consultor pode deletar (regra original da policy
   * "diagnosticos_delete" — as outras 11 tabelas do schema legado
   * permitem delete tanto pro consultor quanto pro cliente dono da
   * empresa, então isso fica false na maioria).
   */
  deleteRequiresConsultor?: boolean;
  /**
   * Se definido, esse campo é preenchido automaticamente com o id do
   * usuário autenticado no insert (ex: "criado_por" em diagnosticos) —
   * nunca aceito do corpo da request.
   */
  autoUserField?: string;
  orderBy?: string;
}

/**
 * Reimplementa em código o padrão de RLS que as 12 tabelas empresa_id-scoped
 * do schema legado compartilhavam: consultor tem acesso total, cliente só
 * mexe na própria empresa_id. Ver src/authorize.ts. Usado por toda tabela
 * que segue esse padrão simples (diagnosticos, checklist_itens,
 * estoque_itens, lancamentos_financeiros, oficinas_parceiras, orcamentos,
 * pops, plano_90_dias, contas_pagar, contas_receber, notas_fiscais,
 * obrigacoes_fiscais). `empresas` é especial (não é filha de empresa_id) e
 * fica em src/routes/empresas.ts.
 */
export function createScopedRouter(config: ScopedResourceConfig): Router {
  const { resource, fields, deleteRequiresConsultor, autoUserField, orderBy } = config;
  const router = Router();

  router.use(requireAuth, requirePerfil);

  // GET /<resource>?empresa_id=... — lista os registros de uma empresa.
  // Mesma forma que useEmpresaData.ts usava: sempre filtrado por empresa.
  router.get(`/${resource}`, ah(async (req, res) => {
    const perfil = req.perfil!;
    const empresaId = req.query.empresa_id as string | undefined;
    if (!empresaId) {
      res.status(400).json({ error: "empresa_id é obrigatório" });
      return;
    }
    if (!canAccessEmpresa(perfil, empresaId)) {
      res.status(404).json({ error: "Empresa não encontrada" });
      return;
    }
    const order = orderBy ? ` order by ${orderBy}` : "";
    const { rows } = await pool.query(
      `select * from ${resource} where empresa_id = $1${order}`,
      [empresaId],
    );
    res.json(rows);
  }));

  // POST /<resource> — body precisa trazer empresa_id + os campos da tabela.
  // Só inclui no INSERT os campos que vieram no body (mesmo padrão do PATCH
  // abaixo) — incluir todo `fields` com `?? null` forçava NULL em colunas
  // com DEFAULT (ex: `concluido boolean NOT NULL DEFAULT false` em
  // checklist_itens, `data timestamptz DEFAULT now()` em diagnosticos),
  // violando NOT NULL ou perdendo o valor default.
  router.post(`/${resource}`, ah(async (req, res) => {
    const perfil = req.perfil!;
    const body = req.body ?? {};
    const empresaId = body.empresa_id as string | undefined;
    if (!empresaId) {
      res.status(400).json({ error: "empresa_id é obrigatório" });
      return;
    }
    if (!canAccessEmpresa(perfil, empresaId)) {
      res.status(403).json({ error: "Sem acesso a essa empresa" });
      return;
    }
    const cols = ["empresa_id"];
    const values: unknown[] = [empresaId];
    for (const f of fields) {
      if (f in body) {
        cols.push(f);
        values.push(body[f]);
      }
    }
    if (autoUserField) {
      cols.push(autoUserField);
      values.push(perfil.id);
    }
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await pool.query(
      `insert into ${resource} (${cols.join(", ")}) values (${placeholders}) returning *`,
      values,
    );
    res.status(201).json(rows[0]);
  }));

  // PATCH /<resource>/:id — carrega a linha primeiro pra saber a empresa_id
  // dela antes de autorizar (o corpo não é confiável pra isso).
  router.patch(`/${resource}/:id`, ah(async (req, res) => {
    const perfil = req.perfil!;
    const { rows: existingRows } = await pool.query(
      `select empresa_id from ${resource} where id = $1`,
      [req.params.id],
    );
    if (existingRows.length === 0) {
      res.status(404).json({ error: "Não encontrado" });
      return;
    }
    if (!canAccessEmpresa(perfil, existingRows[0].empresa_id)) {
      res.status(404).json({ error: "Não encontrado" });
      return;
    }
    const body = req.body ?? {};
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const field of fields) {
      if (field in body) {
        values.push(body[field]);
        updates.push(`${field} = $${values.length}`);
      }
    }
    if (updates.length === 0) {
      res.status(400).json({ error: "Nenhum campo pra atualizar" });
      return;
    }
    values.push(req.params.id);
    const { rows } = await pool.query(
      `update ${resource} set ${updates.join(", ")} where id = $${values.length} returning *`,
      values,
    );
    res.json(rows[0]);
  }));

  // DELETE /<resource>/:id
  router.delete(`/${resource}/:id`, ah(async (req, res) => {
    const perfil = req.perfil!;
    if (deleteRequiresConsultor && perfil.role !== "consultor") {
      res.status(403).json({ error: "Só consultor pode remover" });
      return;
    }
    const { rows: existingRows } = await pool.query(
      `select empresa_id from ${resource} where id = $1`,
      [req.params.id],
    );
    if (existingRows.length === 0) {
      res.status(404).json({ error: "Não encontrado" });
      return;
    }
    if (!canAccessEmpresa(perfil, existingRows[0].empresa_id)) {
      res.status(404).json({ error: "Não encontrado" });
      return;
    }
    await pool.query(`delete from ${resource} where id = $1`, [req.params.id]);
    res.status(204).end();
  }));

  return router;
}
