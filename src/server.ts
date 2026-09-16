import express from "express";
import cors from "cors";
import "dotenv/config";
import { meRouter } from "./routes/me.js";
import { empresasRouter } from "./routes/empresas.js";
import { resourcesRouter } from "./routes/resources.js";

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

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`sevengo-hub-business rodando na porta ${port}`);
});
