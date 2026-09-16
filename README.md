# sevengo-hub-business

Backend de negócio compartilhado do SevenGo Hub. Dono de todo o schema de
dados do Pit Stop Consult (empresas, diagnósticos, financeiro, comercial,
etc.) no Postgres do Railway (projeto `sevengo-hub`) e da autorização que
antes era feita via RLS no Supabase. Todas as frontends novas (Consultoria,
Comercial Cliente, Comercial Consultoria, Portal do Cliente) falam só com
este serviço — nenhuma delas recebe credencial de Postgres.

## Stack
- Node + TypeScript (ESM) + Express
- `pg` direto no Postgres compartilhado (sem ORM)
- Validação de sessão contra o serviço `auth` (better-auth com plugin
  `bearer()`, sem JWT) via `GET {AUTH_INTERNAL_URL}/api/auth/get-session`

## Modelo de autorização
Não existe RLS aqui — o Postgres é puro. `src/middleware.ts` +
`src/authorize.ts` reimplementam em código o que as policies do Supabase
faziam: `role = 'consultor'` → acesso total; `role = 'cliente'` → só a
própria `empresa_id`. Toda rota nova segue esse padrão (ver
`src/routes/empresas.ts` como referência).

## Endpoints
- `GET /health`
- `GET /me` — identidade + perfil + empresas visíveis do usuário autenticado
- `GET /empresas`, `POST /empresas`, `GET /empresas/:id`, `PATCH /empresas/:id`
- CRUD genérico (GET/POST/PATCH/DELETE) pras 12 tabelas empresa_id-scoped —
  ver `src/routes/resources.ts`
- `GET /perfis` — lista usuários já provisionados (só consultor)
- `POST /perfis/convidar` — só consultor. Cria a conta no `auth` service
  (não existe signup aberto — todo usuário é provisionado deliberadamente
  por um consultor) e o `perfil` correspondente numa tacada só. Não há envio
  de e-mail configurado ainda: a senha temporária volta na resposta pra o
  consultor repassar manualmente; o cliente troca no primeiro acesso.

## Variáveis de ambiente (ver `.env.example`)
- `DATABASE_URL` — no Railway, referenciar `${{Postgres.DATABASE_URL}}`
- `AUTH_INTERNAL_URL` — URL interna do serviço `auth` na rede privada do
  Railway (ex: `${{auth.RAILWAY_PRIVATE_DOMAIN}}` com a porta certa)
- `TRUSTED_ORIGINS` — lista separada por vírgula dos domínios das frontends
  que vão consumir esta API
- `AUTH_FALLBACK_ORIGIN` — Origin repassado pro `auth` service em
  `POST /perfis/convidar` quando a chamada não tem um Origin de navegador
  (script/Postman); precisa estar cadastrado no `TRUSTED_ORIGINS` do `auth`
  também. Chamada de frontend real já manda seu próprio Origin, que é
  repassado direto — isso é só um fallback.
- `PORT` — porta do servidor (Railway injeta a sua própria)

## Comandos
```bash
npm install
npm run dev            # dev local
npm run build && npm start   # produção
```

## Schema
As 16 tabelas (perfis, permissoes_departamento, empresas, diagnosticos,
checklist_itens, estoque_itens, lancamentos_financeiros, oficinas_parceiras,
orcamentos, pops, plano_90_dias, contas_pagar, contas_receber,
notas_fiscais, obrigacoes_fiscais) já foram criadas diretamente no Postgres
compartilhado do Railway (fase 0/1 do plano de migração do pitstop-consult).
`user.id` do better-auth é `text` (não `uuid`) — toda FK de usuário
(`perfis.id`, `empresas.consultor_id`, `diagnosticos.criado_por`) usa `text`.

## Deploy no Railway
1. Criar o serviço no projeto `sevengo-hub`, ambiente `production`, conectado
   a este repo no GitHub.
2. `DATABASE_URL` como referência `${{Postgres.DATABASE_URL}}`.
3. `AUTH_INTERNAL_URL` apontando pro domínio privado do serviço `auth`.
4. `TRUSTED_ORIGINS` com os domínios das frontends que forem entrando.
