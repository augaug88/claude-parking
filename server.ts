// Preview server (npm run dev → tsx server.ts). Mounts the same handlers
// Vercel runs from api/, then serves the Vite app.
import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import carparks from "./api/carparks.js";
import onemap from "./api/onemap.js";
import health from "./api/health.js";

type Handler = (req: Request, res: Response) => unknown;
const wrap = (h: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(h(req, res)).catch(next);
};

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  const app = express();
  app.disable("x-powered-by");

  app.get("/api/carparks", wrap(carparks));
  app.get("/api/onemap", wrap(onemap));
  app.get("/api/health", wrap(health));
  app.use("/api", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(404).json({ error: "Not found." });
  });

  if (process.env.NODE_ENV === "production") {
    const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
    app.use(express.static(dist));
    app.use((_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ParkSG listening on http://localhost:${PORT}`);
  });
}

main();
