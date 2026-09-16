import { Router } from "express";
import { createScopedRouter } from "../scopedResource.js";

// Uma rota por tabela empresa_id-scoped do schema legado (ver
// scopedResource.ts pra entender o padrão comum). Campos = as colunas do
// dono original em supabase/migrations/*.sql, sem id/empresa_id/created_at.

export const resourcesRouter = Router();

resourcesRouter.use(
  createScopedRouter({
    resource: "diagnosticos",
    fields: ["data", "nota_estoque", "nota_financeiro", "nota_comercial", "nota_processos", "observacoes"],
    autoUserField: "criado_por",
    deleteRequiresConsultor: true,
    orderBy: "data desc",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "checklist_itens",
    fields: ["pilar", "descricao", "concluido", "data_conclusao", "ordem"],
    orderBy: "ordem asc",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "estoque_itens",
    fields: ["nome", "valor_vendido"],
    orderBy: "nome",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "lancamentos_financeiros",
    fields: ["mes", "entradas", "saidas"],
    orderBy: "mes asc",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "oficinas_parceiras",
    fields: ["nome", "contato", "ultima_compra", "valor_historico"],
    orderBy: "nome",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "orcamentos",
    fields: ["data", "valor", "status", "cliente"],
    orderBy: "data desc",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "pops",
    fields: ["titulo", "descricao", "passo_a_passo", "responsavel", "ultima_atualizacao"],
    orderBy: "titulo",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "plano_90_dias",
    fields: ["fase", "titulo_fase", "acao", "responsavel", "prazo", "status", "ordem"],
    orderBy: "ordem asc",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "contas_pagar",
    fields: [
      "descricao", "categoria", "fornecedor", "valor", "data_vencimento",
      "data_pagamento", "status", "forma_pagamento", "recorrente", "observacoes",
    ],
    orderBy: "data_vencimento",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "contas_receber",
    fields: [
      "descricao", "cliente", "valor", "data_vencimento",
      "data_recebimento", "status", "forma_recebimento", "observacoes",
    ],
    orderBy: "data_vencimento",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "notas_fiscais",
    fields: [
      "numero", "serie", "tipo", "operacao", "cliente_fornecedor",
      "valor", "valor_impostos", "data_emissao", "status", "chave_acesso", "observacoes",
    ],
    orderBy: "data_emissao desc",
  }),
);

resourcesRouter.use(
  createScopedRouter({
    resource: "obrigacoes_fiscais",
    fields: ["nome", "tipo", "competencia", "valor", "data_vencimento", "data_pagamento", "status", "observacoes"],
    orderBy: "data_vencimento",
  }),
);
