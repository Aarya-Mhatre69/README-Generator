/**
 * Fetches rich repository data from GitHub's public API.
 * No API key needed for public repos (60 req/hr unauthenticated,
 * 5000 req/hr if GITHUB_TOKEN is set in .env.local).
 *
 * Fix 4: Explicit 403/rate-limit detection with actionable error messages.
 * All independent fetches run in parallel via Promise.allSettled.
 */

const GH = "https://api.github.com";

function ghHeaders(token) {
  const h = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function ghFetch(path, token) {
  const res = await fetch(`${GH}${path}`, { headers: ghHeaders(token) });
  if (res.status === 404) return null;

  // Fix 4: explicit 403 / rate-limit handling with reset time + token link
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    const resetTime = reset
      ? new Date(Number(reset) * 1000).toLocaleTimeString()
      : "soon";

    if (remaining === "0" || res.status === 429) {
      throw new Error(
        `GitHub API rate limit exceeded. Resets at ${resetTime}. ` +
        `Add a GITHUB_TOKEN to .env.local to increase limit to 5000 req/hr. ` +
        `Get one at: https://github.com/settings/tokens (no scopes needed for public repos)`
      );
    }
    // 403 that isn't rate-limit (e.g. private repo without auth)
    throw new Error(
      `GitHub API returned 403 for ${path}. ` +
      `The repository may be private or require authentication.`
    );
  }

  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${path}`);
  return res.json();
}

async function ghRaw(owner, repo, path, token) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`;
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!res.ok) return null;
  return res.text();
}

const CONFIG_FILES = [
  "package.json",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "Dockerfile",
  "docker-compose.yml",
  ".env.example",
];

export async function fetchRepoIntel(owner, repo, token) {
  // Metadata first — we need default_branch for the tree call
  const meta = await ghFetch(`/repos/${owner}/${repo}`, token);
  if (!meta) {
    throw new Error(
      `Repository ${owner}/${repo} not found. It may be private, deleted, or the URL is wrong.`
    );
  }

  // All remaining calls in parallel
  const [langsRes, treeRes, readmeRes, ...configResults] = await Promise.allSettled([
    ghFetch(`/repos/${owner}/${repo}/languages`, token),
    ghFetch(`/repos/${owner}/${repo}/git/trees/${meta.default_branch}?recursive=0`, token),
    ghFetch(`/repos/${owner}/${repo}/readme`, token),
    ...CONFIG_FILES.map((f) => ghRaw(owner, repo, f, token)),
  ]);

  // Bubble up any rate-limit errors from parallel calls
  for (const result of [langsRes, treeRes, readmeRes, ...configResults]) {
    if (result.status === "rejected" && result.reason?.message?.includes("rate limit")) {
      throw result.reason;
    }
  }

  const sections = [];

  sections.push(`## Repository: ${owner}/${repo}
- Description: ${meta.description || "none"}
- Homepage: ${meta.homepage || "none"}
- Language: ${meta.language || "unknown"}
- Stars: ${meta.stargazers_count} | Forks: ${meta.forks_count}
- License: ${meta.license?.spdx_id || "none"}
- Topics: ${meta.topics?.join(", ") || "none"}
- Default branch: ${meta.default_branch}
- Open issues: ${meta.open_issues_count}`);

  const langs = langsRes.status === "fulfilled" ? langsRes.value : null;
  if (langs && Object.keys(langs).length) {
    const total = Object.values(langs).reduce((a, b) => a + b, 0);
    const pcts = Object.entries(langs)
      .sort((a, b) => b[1] - a[1])
      .map(([l, b]) => `${l} (${((b / total) * 100).toFixed(1)}%)`)
      .join(", ");
    sections.push(`## Languages\n${pcts}`);
  }

  const tree = treeRes.status === "fulfilled" ? treeRes.value : null;
  if (tree?.tree) {
    const entries = tree.tree
      .slice(0, 60)
      .map((e) => `${e.type === "tree" ? "📁" : "📄"} ${e.path}`)
      .join("\n");
    sections.push(`## Root File Tree\n${entries}`);
  }

  const readmeData = readmeRes.status === "fulfilled" ? readmeRes.value : null;
  if (readmeData?.content) {
    const decoded = Buffer.from(readmeData.content, "base64").toString("utf8");
    const trimmed = decoded.length > 3000 ? decoded.slice(0, 3000) + "\n\n[...truncated...]" : decoded;
    sections.push(`## Existing README (reference only)\n${trimmed}`);
  }

  const configFound = [];
  CONFIG_FILES.forEach((file, i) => {
    const result = configResults[i];
    if (result?.status === "fulfilled" && result.value) {
      const content = result.value;
      const trimmed = content.length > 1200 ? content.slice(0, 1200) + "\n[...truncated...]" : content;
      configFound.push(`### ${file}\n\`\`\`\n${trimmed}\n\`\`\``);
    }
  });
  if (configFound.length) {
    sections.push(`## Config & Dependency Files\n${configFound.join("\n\n")}`);
  }

  return {
    intel: sections.join("\n\n"),
    repoMeta: {
      name: meta.name,
      full: meta.full_name,
      description: meta.description,
      language: meta.language,
      license: meta.license?.spdx_id,
      stars: meta.stargazers_count,
    },
  };
}
