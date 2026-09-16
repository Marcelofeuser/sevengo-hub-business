import "dotenv/config";

// O serviço `auth` (sevengo-hub-auth) usa só o plugin bearer() do better-auth,
// sem plugin de JWT — a sessão é um token opaco guardado na tabela `session`
// dele. Não dá pra validar localmente por assinatura: sempre que uma request
// chega aqui com um Authorization header, a gente pergunta pro auth se a
// sessão é válida, via GET /api/auth/get-session (rota que o server.ts do
// auth já expõe em /api/auth/*), pela rede privada do Railway.
//
// Cache em memória por token evita bater no auth a cada request.

const AUTH_INTERNAL_URL = process.env.AUTH_INTERNAL_URL ?? "http://localhost:3000";
const CACHE_TTL_MS = 30_000;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: AuthUser;
}

interface CacheEntry {
  session: AuthSession | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getSession(authorizationHeader: string | undefined): Promise<AuthSession | null> {
  if (!authorizationHeader) return null;

  const cached = cache.get(authorizationHeader);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.session;
  }

  let session: AuthSession | null = null;
  try {
    const res = await fetch(`${AUTH_INTERNAL_URL}/api/auth/get-session`, {
      headers: { Authorization: authorizationHeader },
    });
    if (res.ok) {
      const body = (await res.json()) as AuthSession | null;
      session = body?.user ? body : null;
    }
  } catch (err) {
    // Se o auth estiver fora do ar, falha fechado (sem sessão) em vez de
    // derrubar a request com uma exceção não tratada.
    console.error("Falha ao validar sessão com o auth service:", err);
    session = null;
  }

  cache.set(authorizationHeader, { session, expiresAt: Date.now() + CACHE_TTL_MS });
  return session;
}
