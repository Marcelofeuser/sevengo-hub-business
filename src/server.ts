import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import "dotenv/config";
import { meRouter } from "./routes/me.js";
import { empresasRouter } from "./routes/empresas.js";
import { resourcesRouter } from "./routes/resources.js";
import { perfisRouter } from "./routes/perfis.js";
import { fin360BridgeRouter } from "./routes/fin360Bridge.js";

const app = express();

const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: trustedOrigins,
    credentials: true,
  }),
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(meRouter);
app.use(empresasRouter);
app.use(resourcesRouter);
app.use(perfisRouter);
app.use(fin360BridgeRouter);

// Middleware de erro terminal do Express (assinatura de 4 args é o que faz
// o Express reconhecer como error handler). Todo erro encaminhado por ah()
// (ver asyncHandler.ts) cai aqui em vez de virar unhandled rejection e
// derrubar o processo — responde JSON limpo em vez da página HTML padrão
// do Express ou um crash.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Erro não tratado:", err);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ error: "Erro interno" });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`sevengo-hub-business rodando na porta ${port}`);
});
