import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "../session.js";
import { ah } from "../asyncHandler.js";

export const fin360BridgeRouter = Router();

// ─── Ponte de login pro Fin360 embutido no Hub (17/09/2026) ────────────
// O Fin360 não tem backend próprio — é um SPA que fala direto com o
// Supabase dele (projeto "MotorDrive") via Supabase Auth. Pra abrir
// dentro do Hub já logado, sem pedir senha de novo, a gente pega a
// sessão já validada do lado do servidor (precisa da service_role key,
// que é secreta — por isso isso NUNCA pode acontecer no navegador) e
// devolve um access/refresh token que o Fin360 aplica sozinho via
// supabase.auth.setSession() (ver src/hub-bridge.ts no repo do Fin360).
//
// Restrito por allowlist de e-mail — mesmo padrão do INTERNAL_EMAILS já
// usado no Copiloto SevenGo. Hoje só o Marcelo tem conta no Fin360 que
// faz sentido logar automaticamente pelo Hub; as outras 4 contas que já
// existem no Fin360 continuam acessando do jeito de sempre (fora do Hub).
const FIN360_BRIDGE_EMAILS = new Set(
  (process.env.FIN360_BRIDGE_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

const FIN360_SUPABASE_URL = process.env.FIN360_SUPABASE_URL || "";
const FIN360_SUPABASE_ANON_KEY = process.env.FIN360_SUPABASE_ANON_KEY || "";
const FIN360_SUPABASE_SERVICE_ROLE_KEY = process.env.FIN360_SUPABASE_SERVICE_ROLE_KEY || "";

// Cliente admin (service_role) — só pra gerar o link mágico. Nunca usado
// pra mais nada além disso aqui.
const fin360Admin =
  FIN360_SUPABASE_URL && FIN360_SUPABASE_SERVICE_ROLE_KEY
    ? createClient(FIN360_SUPABASE_URL, FIN360_SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// Cliente anon — troca o hashed_token do link mágico por uma sessão de
// usuário de verdade (access_token/refresh_token), exatamente como o
// Supabase faria se a pessoa tivesse clicado no link recebido por e-mail
// (só que aqui ninguém recebe e-mail nenhum — o link nunca é enviado).
const fin360Anon =
  FIN360_SUPABASE_URL && FIN360_SUPABASE_ANON_KEY
    ? createClient(FIN360_SUPABASE_URL, FIN360_SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

fin360BridgeRouter.post(
  "/bridge/fin360/session",
  ah(async (req, res) => {
    if (!fin360Admin || !fin360Anon) {
      res.status(500).json({ error: "Ponte do Fin360 não configurada no servidor (faltam variáveis FIN360_SUPABASE_*)." });
      return;
    }

    const session = await getSession(req.header("authorization") ?? undefined);
    if (!session) {
      res.status(401).json({ error: "Sessão do Hub inválida ou ausente." });
      return;
    }

    const email = session.user.email?.toLowerCase();
    if (!email || !FIN360_BRIDGE_EMAILS.has(email)) {
      res.status(403).json({ error: "Sua conta não tem o Fin360 liberado dentro do Hub." });
      return;
    }

    const { data: linkData, error: linkError } = await fin360Admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("[fin360-bridge] Falha ao gerar link:", linkError?.message);
      res.status(502).json({ error: "Não foi possível preparar sua sessão do Fin360." });
      return;
    }

    const { data: verifyData, error: verifyError } = await fin360Anon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError || !verifyData?.session) {
      console.error("[fin360-bridge] Falha ao trocar o link por sessão:", verifyError?.message);
      res.status(502).json({ error: "Não foi possível abrir sua sessão do Fin360." });
      return;
    }

    res.json({
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
    });
  }),
);
