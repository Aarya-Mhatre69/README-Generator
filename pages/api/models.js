import { listOllamaModels, checkOllama } from "../../lib/ollama";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const running = await checkOllama();
  if (!running) {
    return res.json({ running: false, models: [] });
  }

  const models = await listOllamaModels();
  return res.json({ running: true, models });
}
