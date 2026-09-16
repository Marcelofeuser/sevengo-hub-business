import { randomBytes } from "node:crypto";
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requirePerfil } from "../middleware.js";
import { ah } from "../asyncHandler.js";

const AUTH_INTERNAL_URL = process.env.AUTH_INTERNAL_URL ?? "http://localhost:3000";
// better-auth exige um header Origin em rotas que mudam estado (proteção
// CSRF, validado contra o TRUSTED_ORIGINS do serviço auth) — como essa
// chamada é server-to-server (business-api -> auth), não existe Origin de
// navegador nenhum por padrão. Repassamos o Origin de quem chamou o
// business-api (o frontend real, que precisa estar no TRUSTED_ORIGINS de
// AMBOS os serviços pra logar direto); AUTH_FALLBACK_ORIGIN cobre chamada
// sem navegador (script, Postman) contanto que esteja cadastrado como
// trusted origin no auth também.
const AUTH_FALLBACK_ORIGIN = process.env.AUTH_FALLBACK_ORIGIN;

export const perfisRouter = Router();

perfisRouter.use(requireAuth, requirePerfil);

function gerarSenhaTemporaria(): string {
  // 12 bytes -> 16 chars base64url, sem caracteres ambíguos de digitar.
  return randomBytes(12).toString("base64url");
}

// GET /perfis?empresa_id=... — só consultor. Lista quem já foi provisionado
// (join com "user" pra trazer o e-mail, que não mora em `perfis`).
perfisRouter.get("/perfis", ah(async (req, res) => {
  const perfil = req.perfil!;
  if (perfil.role !== "consultor") {
    res.status(403).json({ error: "Só consultor pode listar perfis" });
    return;
  }
  const empresaId = req.query.empresa_id as string | undefined;
  const { rows } = empresaId
    ? await pool.query(
        `select p.id, p.nome, p.role, p.empresa_id, u.email
         from perfis p join "user" u on u.id = p.id
         where p.empresa_id = $1 order by p.nome`,
        [empresaId],
      )
    : await pool.query(
        `select p.id, p.nome, p.role, p.empresa_id, u.email
         from perfis p join "user" u on u.id = p.id
         order by p.nome`,
      );
  res.json(rows);
}));

// POST /perfis/convidar — só consultor. Cria a conta no auth service (não
// existe signup aberto — é sempre uma ação deliberada do consultor, ver
// plano) e o perfil correspondente no business-api numa tacada só.
//
// Não há envio de e-mail configurado ainda, então a senha temporária volta
// na resposta pra o consultor repassar manualmente; o cliente troca no
// primeiro acesso (fluxo de troca de senha já é padrão do better-auth,
// endpoint /api/auth/change-password no auth service).
perfisRouter.post("/perfis/convidar", ah(async (req, res) => {
  const perfil = req.perfil!;
  if (perfil.role !== "consultor") {
    res.status(403).json({ error: "Só consultor pode convidar usuários" });
    return;
  }

  const body = req.body ?? {};
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const role = body.role === "consultor" ? "consultor" : "cliente";
  const empresaId = typeof body.empresa_id === "string" ? body.empresa_id : undefined;

  if (!email || !nome) {
    res.status(400).json({ error: "email e nome são obrigatórios" });
    return;
  }
  if (role === "cliente" && !empresaId) {
    res.status(400).json({ error: "empresa_id é obrigatório pra convidar um cliente" });
    return;
  }
  if (empresaId) {
    const { rows: empresaRows } = await pool.query(`select id from empresas where id = $1`, [empresaId]);
    if (empresaRows.length === 0) {
      res.status(404).json({ error: "Empresa não encontrada" });
      return;
    }
  }

  const senhaTemporaria = gerarSenhaTemporaria();

  const origin = req.header("origin") ?? AUTH_FALLBACK_ORIGIN;
  const signupRes = await fetch(`${AUTH_INTERNAL_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ email, password: senhaTemporaria, name: nome }),
  });

  if (!signupRes.ok) {
    let detalhe: unknown;
    try {
      detalhe = await signupRes.json();
    } catch {
      detalhe = await signupRes.text();
    }
    // better-auth responde 422/400 pra e-mail já cadastrado, entre outros —
    // repassamos o status dele em vez de inventar um novo.
    res.status(signupRes.status === 200 ? 409 : signupRes.status).json({
      error: "Não foi possível criar o usuário no auth service",
      detalhe,
    });
    return;
  }

  const signupBody = (await signupRes.json()) as { user?: { id?: string } };
  const userId = signupBody.user?.id;
  if (!userId) {
    res.status(502).json({ error: "auth service não retornou o id do usuário criado" });
    return;
  }

  const { rows } = await pool.query(
    `insert into perfis (id, nome, role, empresa_id) values ($1, $2, $3, $4) returning id, nome, role, empresa_id`,
    [userId, nome, role, role === "cliente" ? empresaId : null],
  );

  res.status(201).json({
    perfil: rows[0],
    email,
    senhaTemporaria,
    aviso: "Repasse essa senha temporária ao usuário por um canal seguro — ela não fica salva em lugar nenhum e não é reenviada.",
  });
}));
