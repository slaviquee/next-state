import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { uploadRouter } from "./api/upload.js";
import { compileRouter } from "./api/compile.js";
import { sceneRouter } from "./api/scene.js";
import { progressRouter } from "./api/progress.js";
import { agentRefreshRouter } from "./api/agent-refresh.js";
import { interventionRouter } from "./api/intervention.js";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.use("/api", uploadRouter);
app.use("/api", compileRouter);
app.use("/api", sceneRouter);
app.use("/api", progressRouter);
app.use("/api", agentRefreshRouter);
app.use("/api", interventionRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});
