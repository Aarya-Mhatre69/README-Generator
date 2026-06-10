import { useState, useCallback, useRef, useEffect } from "react";
import Head from "next/head";

// ─── Markdown → HTML renderer ─────────────────────────────────────────────────
function mdToHtml(raw) {
  const blocks = [];
  let md = raw.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = blocks.length;
    const escaped = code.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    blocks.push(`<pre style="background:#0d1117;color:#e6edf3;border-radius:8px;padding:16px 18px;overflow-x:auto;font-size:12.5px;line-height:1.6;font-family:monospace;margin:1rem 0;border:1px solid #30363d"><code>${escaped}</code></pre>`);
    return `\x00BLOCK${i}\x00`;
  });
  md = md
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/`([^`\n]+)`/g,`<code style="background:#f0f0f0;border:1px solid #ddd;border-radius:4px;padding:1px 6px;font-size:12.5px;font-family:monospace">$1</code>`)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,`<img alt="$1" src="$2" style="max-width:100%;height:auto;border-radius:6px;margin:4px 2px;vertical-align:middle" onerror="this.style.display='none'" />`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,`<a href="$2" style="color:#0969da;text-decoration:none;border-bottom:1px solid currentColor" target="_blank" rel="noopener">$1</a>`)
    .replace(/^#{6} (.+)$/gm,`<h6 style="font-size:12px;font-weight:500;margin:1.2rem 0 0.4rem;color:#666">$1</h6>`)
    .replace(/^#{5} (.+)$/gm,`<h5 style="font-size:13px;font-weight:500;margin:1.2rem 0 0.4rem">$1</h5>`)
    .replace(/^#{4} (.+)$/gm,`<h4 style="font-size:14px;font-weight:500;margin:1.4rem 0 0.5rem">$1</h4>`)
    .replace(/^### (.+)$/gm,`<h3 style="font-size:15px;font-weight:500;margin:1.6rem 0 0.5rem">$1</h3>`)
    .replace(/^## (.+)$/gm,`<h2 style="font-size:17px;font-weight:500;margin:2rem 0 0.7rem;padding-bottom:8px;border-bottom:1px solid #e0e0e0">$1</h2>`)
    .replace(/^# (.+)$/gm,`<h1 style="font-size:22px;font-weight:600;margin:0 0 1rem;line-height:1.2">$1</h1>`)
    .replace(/\*\*\*([^*]+)\*\*\*/g,"<strong><em>$1</em></strong>")
    .replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g,"<em>$1</em>")
    .replace(/~~([^~\n]+)~~/g,"<s>$1</s>")
    .replace(/^&gt; (.+)$/gm,`<blockquote style="margin:1rem 0;padding:10px 16px;border-left:3px solid #d0d7de;color:#555;font-style:italic">$1</blockquote>`)
    .replace(/^---+$/gm,`<hr style="border:none;border-top:1px solid #e0e0e0;margin:1.5rem 0" />`)
    .replace(/^\|(.+)\|$/gm,(row)=>{
      const cells=row.split("|").slice(1,-1).map(c=>c.trim());
      return `<tr>${cells.map(c=>`<td style="padding:7px 12px;border:1px solid #d0d7de;font-size:13px">${c}</td>`).join("")}</tr>`;
    })
    .replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g,(t)=>{
      const rows=t.trim().split("</tr>").filter(r=>r.includes("<tr>"));
      if(!rows.length)return t;
      const head=rows[0].replace(/<td/g,`<th style="padding:7px 12px;border:1px solid #d0d7de;font-size:13px;font-weight:500;background:#f6f8fa"`).replace(/<\/td>/g,"</th>");
      const body=rows.slice(2).map(r=>r+"</tr>").join("");
      return `<table style="width:100%;border-collapse:collapse;margin:1rem 0">${head}</tr>${body}</table>`;
    });
  const lines=md.split("\n");const out=[];let inUl=false,inOl=false;
  for(const line of lines){
    if(/^[-*+] /.test(line)){if(!inUl){out.push('<ul style="margin:0.5rem 0 0.5rem 1.4rem;padding:0;list-style:disc">');inUl=true;}out.push(`<li style="margin:3px 0;line-height:1.6">${line.replace(/^[-*+] /,"")}</li>`);}
    else if(/^\d+\. /.test(line)){if(!inOl){out.push('<ol style="margin:0.5rem 0 0.5rem 1.4rem;padding:0">');inOl=true;}out.push(`<li style="margin:3px 0;line-height:1.6">${line.replace(/^\d+\. /,"")}</li>`);}
    else{if(inUl){out.push("</ul>");inUl=false;}if(inOl){out.push("</ol>");inOl=false;}out.push(line);}
  }
  if(inUl)out.push("</ul>");if(inOl)out.push("</ol>");
  let result=out.join("\n").replace(/\n{3,}/g,"\n\n").replace(/([^\n>])(\n)([^\n<#|*`\-\d])/g,"$1<br/>$3");
  blocks.forEach((b,i)=>{result=result.replace(`\x00BLOCK${i}\x00`,b);});
  return result;
}

function Spinner({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ animation: "spin 0.8s linear infinite", display: "block", flexShrink: 0 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="2" strokeDasharray="25 13" strokeLinecap="round"/>
    </svg>
  );
}

const STEPS = [
  { label: "Check Ollama" },
  { label: "Fetch GitHub data" },
  { label: "Generate README" },
  { label: "Done" },
];

const EXAMPLES = [
  "https://github.com/fastapi/fastapi",
  "https://github.com/expressjs/express",
  "https://github.com/django/django",
];

// ─── Fix 2: Ollama health banner ──────────────────────────────────────────────
function OllamaStatus({ status, models, selectedModel, onModelChange }) {
  if (status === "loading") return null;

  if (status === "offline") {
    return (
      <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: "1rem", background: "#fff8f0", border: "1px solid #f5c07a", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 16, marginTop: 1 }}>⚠️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#b45309", marginBottom: 4 }}>
            Ollama not detected — run <code style={{ background: "#f5f0e8", padding: "1px 6px", borderRadius: 3 }}>ollama serve</code> to start
          </div>
          <div style={{ fontSize: 12.5, color: "#92400e", lineHeight: 1.6 }}>
            This app runs entirely on your machine. Ollama must be running locally before you can generate.
            {" "}<a href="https://ollama.com/download" target="_blank" rel="noopener" style={{ color: "#92400e", fontWeight: 500 }}>Download Ollama →</a>
          </div>
          <code style={{ display: "inline-block", marginTop: 6, background: "#1e1e1e", color: "#d4d4d4", padding: "4px 10px", borderRadius: 5, fontSize: 12.5 }}>
            ollama serve
          </code>
          <span style={{ fontSize: 12, color: "#92400e", marginLeft: 8 }}>
            (then{" "}
            <code style={{ background: "#f5f0e8", padding: "1px 5px", borderRadius: 3, fontSize: 12 }}>ollama pull llama3.2</code>
            {" "}if you haven't yet)
          </span>
        </div>
      </div>
    );
  }

  if (status === "no_models") {
    return (
      <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: "1rem", background: "#fff8f0", border: "1px solid #f5c07a", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 16, marginTop: 1 }}>📦</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#b45309", marginBottom: 4 }}>Ollama is running but no models are installed</div>
          <code style={{ display: "inline-block", marginTop: 4, background: "#1e1e1e", color: "#d4d4d4", padding: "4px 10px", borderRadius: 5, fontSize: 12.5 }}>
            ollama pull llama3.2
          </code>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 12px", borderRadius: 8, marginBottom: "1rem", background: "#f0fff4", border: "1px solid #86efac", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: "#166534", display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
        Ollama running
      </span>
      <span style={{ fontSize: 12, color: "#15803d" }}>{models.length} model{models.length !== 1 ? "s" : ""} available</span>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <label style={{ fontSize: 12, color: "#166534" }}>Model:</label>
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          style={{ fontSize: 12.5, padding: "3px 8px", borderRadius: 5, border: "1px solid #86efac", background: "#fff", color: "#111", cursor: "pointer", fontFamily: "monospace" }}
        >
          {models.map((m) => (<option key={m} value={m}>{m}</option>))}
        </select>
      </div>
    </div>
  );
}

// ─── Fix 9: partial/stream error banner ───────────────────────────────────────
function StreamError({ message, hasPartial, fix, link, onRetry, onKeepPartial }) {
  return (
    <div style={{ padding: "13px 15px", borderRadius: 8, border: "1px solid #f5c6c6", background: "#fff5f5", marginBottom: "1rem" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚠</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#c0392b", marginBottom: 3 }}>
            {hasPartial ? "Generation interrupted — partial output below" : "Generation failed"}
          </div>
          <div style={{ fontSize: 12.5, color: "#c0392b", opacity: 0.85, lineHeight: 1.5 }}>{message}</div>
          {fix && (
            <code style={{ display: "inline-block", marginTop: 6, background: "#1e1e1e", color: "#d4d4d4", padding: "4px 10px", borderRadius: 5, fontSize: 12.5 }}>
              {fix}
            </code>
          )}
          {link && (
            <a href={link} target="_blank" rel="noopener"
              style={{ display: "inline-block", marginTop: 6, marginLeft: fix ? 10 : 0, fontSize: 12.5, color: "#c0392b", fontWeight: 500 }}>
              Get GitHub token →
            </a>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={onRetry} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, border: "1px solid #f5c6c6", background: "transparent", color: "#c0392b", cursor: "pointer", fontWeight: 500 }}>
              ↺ Retry
            </button>
            {hasPartial && (
              <button onClick={onKeepPartial} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, border: "1px solid #ccc", background: "transparent", color: "#666", cursor: "pointer" }}>
                Keep partial output
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(-1);
  const [log, setLog] = useState("");
  const [readme, setReadme] = useState("");
  const [streamingReadme, setStreamingReadme] = useState("");
  const [repoName, setRepoName] = useState("");
  const [usedModel, setUsedModel] = useState("");
  const [error, setError] = useState("");
  const [errorMeta, setErrorMeta] = useState({}); // { fix, link, hasPartial, partial }
  const [tab, setTab] = useState("preview");
  const [copied, setCopied] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState("loading");
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const abortRef = useRef(null);
  const streamRef = useRef("");

  // Fix 2: use /api/health (not /api/models) for richer status
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        setOllamaStatus(data.status === "ready" ? "online" : data.status === "no_models" ? "no_models" : "offline");
        setModels(data.models || []);
        if (data.models?.length) setSelectedModel(data.models[0]);
      })
      .catch(() => setOllamaStatus("offline"));
  }, []);

  // Fix 10: abort helper
  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const run = useCallback(async (urlOverride) => {
    const trimmed = (urlOverride ?? url).trim();
    if (!trimmed || loading) return;

    abort(); // Fix 10: cancel any in-flight request before starting a new one
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(""); setErrorMeta({});
    setReadme(""); setStreamingReadme(""); setRepoName(""); setUsedModel("");
    setPhase(-1); setLog("");
    streamRef.current = "";

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: trimmed, model: selectedModel || undefined }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Server error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          let eventName = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          let payload;
          try { payload = JSON.parse(dataStr); } catch { continue; }

          if (eventName === "phase") { setPhase(payload.phase); setLog(payload.log); }
          else if (eventName === "model") { setUsedModel(payload.model); }
          else if (eventName === "token") {
            streamRef.current += payload.chunk;
            setStreamingReadme(streamRef.current);
          }
          else if (eventName === "done") {
            setReadme(payload.readme);
            setStreamingReadme("");
            setRepoName(payload.repoName);
            setUsedModel(payload.model);
            setTab("preview");
          }
          // Fix 9: structured error with partial-output awareness
          else if (eventName === "error") {
            const partial = streamRef.current;
            setError(payload.message);
            setErrorMeta({
              fix: payload.fix || null,
              link: payload.link || null,
              hasPartial: payload.partial === true || partial.length > 80,
              partial,
            });
            setStreamingReadme(""); // clear the live stream
            setLoading(false);
            setPhase(-1);
            abortRef.current = null;
            return;
          }
        }
      }

      // Fix 9: if stream ended without a "done" event, treat as mid-stream failure
      if (!readme && streamRef.current.length > 80) {
        setError("Stream ended unexpectedly. The partial output below may be usable.");
        setErrorMeta({ hasPartial: true, partial: streamRef.current });
        setStreamingReadme("");
      }

    } catch (e) {
      if (e.name === "AbortError") {
        // Fix 10: user cancelled — show partial if we have it
        const partial = streamRef.current;
        if (partial.length > 80) {
          setError("Generation stopped.");
          setErrorMeta({ hasPartial: true, partial });
        }
        setStreamingReadme("");
        return;
      }
      setError(e.message || "Something went wrong. Please try again.");
      setErrorMeta({});
    } finally {
      setLoading(false);
      setPhase(-1);
      abortRef.current = null;
    }
  }, [url, loading, selectedModel, abort]);

  const stop = useCallback(() => {
    abort();
    // loading/state cleanup handled in run()'s catch block
  }, [abort]);

  const copy = () => {
    navigator.clipboard.writeText(readme).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const download = () => {
    const blob = new Blob([readme], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${repoName ? repoName.split("/")[1] : "README"}-README.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  // Fix 9: keep partial output from an interrupted stream
  const keepPartial = useCallback(() => {
    if (errorMeta.partial) {
      setReadme(errorMeta.partial.replace(/^```markdown\n/, "").replace(/\n```\s*$/, "").trim());
      setError("");
      setErrorMeta({});
      setTab("preview");
    }
  }, [errorMeta]);

  const isDisabled = !url.trim() || loading || ollamaStatus === "offline" || ollamaStatus === "no_models";

  return (
    <>
      <Head>
        {/* Fix 1: title accurately reflects local-only nature */}
        <title>README Generator — Runs Locally with Ollama</title>
        <meta name="description" content="Self-hosted, offline AI README generator. Requires Ollama running on your machine. No API keys, no cloud, no cost." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;font-family:'Geist',-apple-system,sans-serif;background:#f5f5f5;color:#111;-webkit-font-smoothing:antialiased;}
        :root{--mono:'Geist Mono','SF Mono',monospace;--border:#e5e5e5;--border-strong:#ccc;--bg:#f5f5f5;--card:#fff;--muted:#f7f7f7;--text:#111;--muted-text:#666;--faint:#999;}
        input,button,textarea,select{font-family:inherit;}
        input::placeholder{color:var(--faint);}
        input:focus,textarea:focus{outline:none;}
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>

        {/* Fix 1: header clearly states local-only requirement */}
        <header style={{ padding: "2rem 2rem 1.5rem", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff", flexShrink: 0 }}>✦</div>
              <h1 style={{ fontSize: 19, fontWeight: 500, margin: 0, letterSpacing: "-0.3px" }}>README Generator</h1>
              <span style={{ fontSize: 10.5, fontWeight: 500, padding: "2px 7px", background: "#f0fff4", border: "1px solid #86efac", borderRadius: 20, color: "#166534", letterSpacing: "0.05em", textTransform: "uppercase" }}>Local · Free · No API Key</span>
            </div>
            {/* Fix 1: honest description — no "live demo" framing */}
            <p style={{ fontSize: 13, color: "var(--muted-text)", margin: 0 }}>
              Runs entirely on your machine.{" "}
              <strong style={{ color: "var(--text)", fontWeight: 500 }}>Requires <a href="https://ollama.com" target="_blank" rel="noopener" style={{ color: "var(--text)" }}>Ollama</a> running locally.</strong>
              {" "}Fetches repo data from GitHub's public API, generates the README offline via your local LLM.
            </p>
          </div>
        </header>

        <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "1.75rem 2rem 4rem" }}>

          {/* Fix 2: health-aware Ollama status banner */}
          <OllamaStatus status={ollamaStatus} models={models} selectedModel={selectedModel} onModelChange={setSelectedModel} />

          {/* Input card */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.2rem", marginBottom: "1rem" }}>
            <label style={{ fontSize: 11.5, fontWeight: 500, color: "var(--muted-text)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
              GitHub Repository URL
            </label>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && run()}
                placeholder="https://github.com/owner/repository"
                disabled={loading}
                style={{ flex: 1, padding: "10px 13px", borderRadius: 7, border: "1px solid var(--border-strong)", background: "var(--muted)", color: "var(--text)", fontSize: 13.5, fontFamily: "var(--mono)", opacity: loading ? 0.6 : 1, transition: "border-color 0.15s" }}
                onFocus={(e) => (e.target.style.borderColor = "#888")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border-strong)")}
              />
              {/* Fix 10: Stop button replaces Generate while loading */}
              {loading ? (
                <button
                  onClick={stop}
                  style={{ padding: "10px 18px", borderRadius: 7, border: "1px solid #f5c6c6", background: "#fff5f5", color: "#c0392b", fontSize: 13.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}
                >
                  ■ Stop
                </button>
              ) : (
                <button
                  onClick={() => run()}
                  disabled={isDisabled}
                  style={{ padding: "10px 20px", borderRadius: 7, border: "none", background: isDisabled ? "var(--muted)" : "#111", color: isDisabled ? "var(--faint)" : "#fff", fontSize: 13.5, fontWeight: 500, cursor: isDisabled ? "not-allowed" : "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 7, transition: "all 0.15s", flexShrink: 0 }}
                >
                  Generate README
                </button>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Try:</span>
              {EXAMPLES.map((ex) => (
                <button key={ex}
                  onClick={() => { if (!loading) { setUrl(ex); } }}
                  disabled={loading}
                  style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 20, border: "1px solid var(--border)", background: "transparent", color: "var(--muted-text)", cursor: loading ? "not-allowed" : "pointer", fontFamily: "var(--mono)", transition: "all 0.12s" }}
                  onMouseEnter={(e) => { if (!loading) { e.target.style.background = "var(--muted)"; e.target.style.color = "var(--text)"; } }}
                  onMouseLeave={(e) => { e.target.style.background = "transparent"; e.target.style.color = "var(--muted-text)"; }}
                >
                  {ex.replace("https://github.com/", "")}
                </button>
              ))}
            </div>
          </div>

          {/* Progress */}
          {loading && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.2rem 1.4rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                  <Spinner size={13} />
                  {log || "Starting…"}
                </span>
                {usedModel && <span style={{ fontSize: 11.5, color: "var(--faint)", fontFamily: "var(--mono)" }}>{usedModel}</span>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {STEPS.map((s, i) => {
                  const done = i < phase;
                  const active = i === phase;
                  return (
                    <div key={i} style={{ flex: 1 }}>
                      <div style={{ height: 3, borderRadius: 4, marginBottom: 6, background: done ? "#111" : active ? "linear-gradient(90deg,#111 60%,#e0e0e0 60%)" : "#e0e0e0", transition: "background 0.4s" }} />
                      <div style={{ fontSize: 11, color: done || active ? "var(--text)" : "var(--faint)", fontWeight: active ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {done ? "✓ " : active ? "⟳ " : ""}{s.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fix 9: structured error with retry + keep-partial actions */}
          {error && !loading && (
            <StreamError
              message={error}
              hasPartial={errorMeta.hasPartial}
              fix={errorMeta.fix}
              link={errorMeta.link}
              onRetry={() => run()}
              onKeepPartial={keepPartial}
            />
          )}

          {/* Output */}
          {readme && !loading && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
                  {["preview", "raw"].map((t) => (
                    <button key={t} onClick={() => setTab(t)}
                      style={{ padding: "5px 14px", fontSize: 12.5, border: "none", borderRight: t === "preview" ? "1px solid var(--border)" : "none", background: tab === t ? "var(--card)" : "transparent", color: tab === t ? "var(--text)" : "var(--muted-text)", cursor: "pointer", fontWeight: tab === t ? 500 : 400, transition: "all 0.1s" }}>
                      {t === "preview" ? "Preview" : "Markdown"}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {repoName && <span style={{ fontSize: 11.5, color: "var(--faint)", fontFamily: "var(--mono)", marginRight: 4 }}>{repoName}</span>}
                  {usedModel && <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 12, background: "#f0fff4", border: "1px solid #86efac", color: "#166534", fontFamily: "var(--mono)" }}>{usedModel}</span>}
                  <button onClick={copy} style={{ padding: "5px 12px", fontSize: 12.5, borderRadius: 6, border: "1px solid var(--border-strong)", background: copied ? "#f0fff4" : "var(--card)", color: copied ? "#166534" : "var(--text)", cursor: "pointer", transition: "all 0.15s" }}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                  <button onClick={download} style={{ padding: "5px 12px", fontSize: 12.5, borderRadius: 6, border: "none", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 500 }}>
                    ↓ Download
                  </button>
                </div>
              </div>
              {tab === "preview" ? (
                <div dangerouslySetInnerHTML={{ __html: mdToHtml(readme) }} style={{ padding: "1.75rem 2rem", fontSize: 14, lineHeight: 1.75, color: "var(--text)", overflowX: "auto", minHeight: 300 }} />
              ) : (
                <textarea readOnly value={readme} onClick={(e) => e.target.select()} style={{ display: "block", width: "100%", minHeight: 520, padding: "1.5rem", border: "none", outline: "none", resize: "vertical", background: "var(--card)", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.65 }} />
              )}
              <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", background: "var(--muted)", display: "flex", gap: 16, alignItems: "center" }}>
                {[{ label: "Lines", val: readme.split("\n").length }, { label: "Words", val: readme.split(/\s+/).filter(Boolean).length }, { label: "Chars", val: readme.length }].map((s) => (
                  <span key={s.label} style={{ fontSize: 11.5, color: "var(--faint)" }}>
                    <span style={{ fontWeight: 500, color: "var(--muted-text)" }}>{s.val.toLocaleString()}</span> {s.label}
                  </span>
                ))}
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--faint)" }}>README.md</span>
              </div>
            </div>
          )}

          {/* Live stream preview while generating */}
          {loading && streamingReadme && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginTop: "1rem" }}>
              <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
                <Spinner size={12} />
                <span style={{ fontSize: 12, color: "var(--muted-text)", fontWeight: 500 }}>Generating live preview…</span>
              </div>
              <div dangerouslySetInnerHTML={{ __html: mdToHtml(streamingReadme) }}
                style={{ padding: "1.5rem 2rem", fontSize: 13.5, lineHeight: 1.75, color: "var(--text)", overflowX: "auto", opacity: 0.85 }} />
            </div>
          )}

          {/* Empty state */}
          {!readme && !loading && !error && (
            <div style={{ border: "1px dashed var(--border-strong)", borderRadius: 10, padding: "3rem 2rem", textAlign: "center", color: "var(--faint)" }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.25 }}>✦</div>
              <div style={{ fontSize: 13.5, marginBottom: 6, color: "var(--muted-text)" }}>Your README will appear here</div>
              <div style={{ fontSize: 12.5 }}>Paste a GitHub URL above and hit Generate</div>
            </div>
          )}

        </main>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid var(--border)", padding: "1.25rem 2rem", background: "var(--card)" }}>
          <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 12.5, color: "var(--faint)" }}>
              Built by{" "}
              <a href="https://github.com/Aarya-Mhatre69/" target="_blank" rel="noopener"
                style={{ color: "var(--muted-text)", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid var(--border)" }}>
                Aarya Mhatre
              </a>
              {" "}· Open source · MIT License
            </span>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <a href="https://github.com/Aarya-Mhatre69" target="_blank" rel="noopener" title="GitHub"
                style={{ color: "var(--muted-text)", textDecoration: "none", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}
                onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "var(--muted-text)"}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
                GitHub
              </a>
              <a href="https://www.linkedin.com/in/aarya-mhatre-3b98a7289/" target="_blank" rel="noopener" title="LinkedIn"
                style={{ color: "var(--muted-text)", textDecoration: "none", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}
                onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "var(--muted-text)"}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.37V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.59 0 4.26 2.37 4.26 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>
                LinkedIn
              </a>
              <a href="https://twitter.com/AaryaMhatre" target="_blank" rel="noopener" title="Twitter / X"
                style={{ color: "var(--muted-text)", textDecoration: "none", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}
                onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "var(--muted-text)"}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                Twitter
              </a>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
