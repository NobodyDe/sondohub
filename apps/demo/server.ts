import { sondoAuth } from "@sondohub/server";
import express from "express";

// Cada app dá nome aos seus níveis: nada de número mágico espalhado pelo código.
const Level = { READ: 1, EDIT: 2, ADMIN: 3 } as const;

const app = express();

// Toda rota em /api exige um access token válido, emitido pelo hub para o "aud" demo.
app.use("/api", sondoAuth({ hubUrl: process.env.HUB_URL!, audience: "demo" }));

app.get("/api/hello", (req, res) => {
  res.json({
    message: `Olá, ${req.sondoUser!.name}!`,
    level: req.sondoUser!.level,
  });
});

app.get("/api/admin-only", (req, res) => {
  if (req.sondoUser!.level < Level.ADMIN) {
    res.sendStatus(403);
    return;
  }
  res.json({ secret: "só quem tem nível 3 vê isto" });
});

app.listen(Number(process.env.DEMO_API_PORT));
