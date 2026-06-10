/**
 * Ollama client — calls the local Ollama REST API.
 * Ollama must be running: `ollama serve`
 * Model must be pulled: `ollama pull llama3.2`
 *
 * LATENCY OPTIMIZATIONS:
 * - num_ctx reduced to 4096 (was 8192) — halves processing time for most repos
 * - num_predict capped at 2048 — prevents runaway generation
 * - Streaming enabled so UI shows output token-by-token instead of waiting
 */

const OLLAMA_BASE = process.env.OLLAMA_HOST || "http://localhost:11434";

export async function listOllamaModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

export async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Stream README generation from Ollama token by token.
 * Calls onToken(chunk) for each streamed piece.
 * Returns the full assembled string when done.
 */
export async function ollamaStream(model, system, prompt, onToken, options = {}) {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      system,
      prompt,
      stream: true,
      options: {
        temperature: 0.2,
        num_ctx: 4096,
        num_predict: 2048,
        ...options,
      },
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 404) throw new Error(`Model "${model}" not found. Run: ollama pull ${model}`);
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.response) {
          full += parsed.response;
          onToken(parsed.response);
        }
        if (parsed.done) return full;
      } catch { /* skip malformed chunks */ }
    }
  }
  return full;
}

// Keep non-streaming version for backwards compat
export async function ollamaGenerate(model, system, prompt, options = {}) {
  return ollamaStream(model, system, prompt, () => {}, options);
}

export const PREFERRED_MODELS = [
  "llama3.2",
  "llama3.1",
  "llama3",
  "mistral",
  "mixtral",
  "gemma2",
  "gemma",
  "phi3",
  "phi",
  "qwen2.5",
  "qwen2",
  "deepseek-r1",
  "codellama",
];

export async function pickBestModel(preferredModel) {
  const available = await listOllamaModels();
  if (!available.length) return null;
  if (preferredModel) {
    const match = available.find((m) => m === preferredModel || m.startsWith(preferredModel + ":"));
    if (match) return match;
  }
  for (const pref of PREFERRED_MODELS) {
    const match = available.find((m) => m === pref || m.startsWith(pref + ":"));
    if (match) return match;
  }
  return available[0];
}
