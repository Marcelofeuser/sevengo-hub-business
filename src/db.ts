import { Pool } from "pg";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definida");
}

// Pool único compartilhado por todo o processo — mesmo padrão do
// sevengo-hub-auth (src/auth.ts usa um `new Pool(...)` direto do better-auth).
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
