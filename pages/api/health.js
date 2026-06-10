/**
 * Fix 2: /api/health — pings Ollama and returns a structured status.
 * Used by the UI on mount to show the Ollama status banner.
 * Also useful as a readiness probe if self-hosting behind a reverse proxy.
 */
import { checkOllama, listOllamaModels } from "../../lib/ollama";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const running = await checkOllama();
  if (!running) {
    return res.status(503).json({
      status: "offline",
      running: false,
      models: [],
      message: "Ollama is not running. Start it with: ollama serve",
    });
  }

  const models = await listOllamaModels();
  return res.status(200).json({
    status: models.length > 0 ? "ready" : "no_models",
    running: true,
    models,
    message: models.length > 0
      ? `Ollama running with ${models.length} model(s)`
      : "Ollama running but no models installed. Run: ollama pull llama3.2",
  });
}
