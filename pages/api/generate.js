import { fetchRepoIntel } from "../../lib/github";
import { checkOllama, ollamaStream, pickBestModel, listOllamaModels } from "../../lib/ollama";

// Fix 3: strict GitHub repo URL validation — must be https://github.com/owner/repo
const GITHUB_REPO_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/)?$/;

function parseGHUrl(raw) {
  const cleaned = raw.trim().replace(/\.git$/, "").replace(/\/$/, "");
  if (!GITHUB_REPO_REGEX.test(cleaned + "/")) {
    throw new Error("Invalid GitHub repo URL. Expected: https://github.com/owner/repo");
  }
  const m = cleaned.match(/github\.com\/([^/\s]+)\/([^/\s]+)/);
  if (!m) throw new Error("Could not parse owner/repo from URL.");
  return { owner: m[1], repo: m[2] };
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { repoUrl, model: requestedModel } = req.body || {};

  // Fix 3: validate before doing anything else — fail fast with 400
  if (!repoUrl) return res.status(400).json({ error: "repoUrl is required" });
  const cleanedUrl = repoUrl.trim().replace(/\.git$/, "").replace(/\/$/, "");
  if (!GITHUB_REPO_REGEX.test(cleanedUrl + "/")) {
    return res.status(400).json({ error: "Invalid GitHub repo URL. Expected: https://github.com/owner/repo" });
  }

  let owner, repo;
  try {
    ({ owner, repo } = parseGHUrl(repoUrl));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // SSE headers — Fix 8 header is set at the Next.js config level too
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Fix 10: track if client disconnected mid-stream
  let aborted = false;
  req.on("close", () => { aborted = true; });

  try {
    // ── Check Ollama ──────────────────────────────────────────────────────────
    sse(res, "phase", { phase: 0, log: "Checking Ollama..." });
    const ollamaRunning = await checkOllama();
    if (!ollamaRunning) {
      sse(res, "error", {
        message: "Ollama is not running. Start it with: ollama serve",
        fix: "ollama serve",
      });
      return res.end();
    }

    const model = await pickBestModel(requestedModel);
    if (!model) {
      const available = await listOllamaModels();
      sse(res, "error", {
        message: available.length === 0
          ? "No models installed. Run: ollama pull llama3.2"
          : `No suitable model found. Available: ${available.join(", ")}`,
        fix: "ollama pull llama3.2",
      });
      return res.end();
    }
    sse(res, "model", { model });

    // ── Fetch GitHub data ─────────────────────────────────────────────────────
    sse(res, "phase", { phase: 1, log: `Fetching ${owner}/${repo} from GitHub...` });
    const token = process.env.GITHUB_TOKEN || null;

    // Fix 4: surface GitHub 403/rate-limit with actionable message (handled in github.js,
    // but we also catch it here and emit a structured SSE error with token link)
    let intel, repoMeta;
    try {
      ({ intel, repoMeta } = await fetchRepoIntel(owner, repo, token));
    } catch (ghErr) {
      const isRateLimit = ghErr.message?.toLowerCase().includes("rate limit");
      sse(res, "error", {
        message: ghErr.message,
        fix: isRateLimit ? "Set GITHUB_TOKEN in .env.local — get one at https://github.com/settings/tokens" : null,
        link: isRateLimit ? "https://github.com/settings/tokens" : null,
      });
      return res.end();
    }

    if (aborted) return res.end();

    // ── Stream README from Ollama ─────────────────────────────────────────────
    sse(res, "phase", { phase: 2, log: `Generating with ${model}...` });

    const system = `You are an expert technical writer who creates world-class GitHub README files.
Output ONLY raw markdown. No preamble, no explanation, no "here is your README".
Start directly with the # Title line.
Rules:
- Use ONLY the information provided. Never invent commands, features, or APIs not in the data.
- Use shields.io badges for language, license, and stars where data is available.
- Include syntax-highlighted fenced code blocks with real commands from the data.
- Only include sections relevant and supported by the data.
- Be concise, technically precise, developer-focused.
- No emoji overload, no marketing fluff, no placeholder text.
- Sections to include only if evidenced: Title, Badges, Description, Features, Tech Stack,
  Project Structure, Prerequisites, Installation, Quick Start, Environment Variables,
  Scripts, Docker, Deployment, Testing, Contributing, License.`;

    const prompt = `Generate a production-ready README.md for: https://github.com/${owner}/${repo}\n\n${intel}`;

    let readmeBuffer = "";
    let streamError = null;

    try {
      // Fix 9 + Fix 10: pass aborted flag into stream so we can bail mid-generation
      const full = await ollamaStream(model, system, prompt, (chunk) => {
        if (aborted) return; // client disconnected — stop writing
        readmeBuffer += chunk;
        sse(res, "token", { chunk });
      });
      readmeBuffer = full || readmeBuffer;
    } catch (streamErr) {
      streamError = streamErr;
    }

    // Fix 9: if stream failed mid-way, emit structured error
    if (streamError) {
      sse(res, "error", {
        message: `Generation interrupted: ${streamError.message}. The partial output above may be incomplete.`,
        partial: readmeBuffer.length > 80, // tell UI whether partial content exists
      });
      return res.end();
    }

    if (aborted) return res.end();

    const cleaned = readmeBuffer
      .replace(/^(sure[!,.]?|here('s| is) (your |the |a )?readme[.!]?\s*\n+)/i, "")
      .replace(/^```markdown\n/, "")
      .replace(/\n```\s*$/, "")
      .trim();

    if (!cleaned || cleaned.length < 80) {
      sse(res, "error", { message: "Model returned an empty README. Try a larger model like llama3.1 or mistral." });
      return res.end();
    }

    sse(res, "phase", { phase: 3, log: "Done!" });
    sse(res, "done", { readme: cleaned, repoName: `${owner}/${repo}`, model, repoMeta });

  } catch (err) {
    console.error("Generate error:", err);
    sse(res, "error", { message: err.message || "Generation failed. Please try again." });
  } finally {
    res.end();
  }
}

// Fix 5 note: edge runtime is NOT used here because:
// - Ollama runs on localhost (not reachable from Vercel edge network)
// - This app is designed for local/self-hosted use only
// - Node.js runtime is required for Buffer, streaming, etc.
export const config = {
  api: { bodyParser: true, responseLimit: false },
};
