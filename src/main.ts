import { config } from "dotenv";
config({ path: ".env.local" });

import Fastify from "fastify";
import { adminRoutes } from "./routes/admin.js";
import { informesRoutes } from "./routes/informes.js";
import { runsRoutes } from "./routes/runs.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

await app.register(runsRoutes);
await app.register(informesRoutes);
await app.register(adminRoutes);

const port = Number(process.env.PORT ?? 8000);
app
  .listen({ host: "0.0.0.0", port })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
