<div align="center">

# ✦ README Generator

**AI-powered GitHub README generator — 100% free, fully offline, no API keys.**

[![License: MIT](https://img.shields.io/badge/License-MIT-black?style=flat-square)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Powered by Ollama](https://img.shields.io/badge/Ollama-local%20LLM-black?style=flat-square)](https://ollama.com)
[![Made in India](https://img.shields.io/badge/Made%20in-India-FF9933?style=flat-square)](https://github.com/aarllen)

[**Live Demo**](https://github.com/aarllen/readme-generator) · [**Report a Bug**](https://github.com/aarllen/readme-generator/issues) · [**Request a Feature**](https://github.com/aarllen/readme-generator/issues)

</div>

---

## What it does

Paste any public GitHub URL → the app fetches the repo's file tree, languages, dependencies, and existing README via the GitHub public API, then feeds that data to a local Ollama LLM to write a production-ready `README.md`. Everything stays on your machine.

```
GitHub URL  →  GitHub API (file tree, languages, deps)  →  Ollama (local LLM)  →  README.md
```

No cloud calls. No API keys. No cost. Tokens stream live to your browser as they generate.

---

## Features

- **Zero cost** — uses GitHub's free public API and a local Ollama model
- **Fully offline** — after initial model download, works with no internet
- **Live streaming** — watch the README generate token-by-token in real time
- **Auto model detection** — detects all installed Ollama models, lets you switch between them
- **Smart repo intel** — fetches file tree, languages breakdown, package.json, Dockerfile, .env.example and more, all in parallel
- **Preview + raw** — rendered markdown preview and raw editor side by side
- **One-click download** — exports as `<repo-name>-README.md`

---

## Prerequisites

- [Node.js 18+](https://nodejs.org)
- [Ollama](https://ollama.com/download)

---

## Setup

```bash
# 1. Install Ollama
# Windows: https://ollama.com/download
# macOS / Linux:
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull a model
ollama pull llama3.2

# 3. Ollama auto-starts on Windows after install.
# On macOS/Linux, start it manually:
ollama serve

# 4. Clone this repo
git clone https://github.com/aarllen/readme-generator.git
cd readme-generator

# 5. Install dependencies and run
npm install
npm run dev
```

Open **http://localhost:3000**

---

## Recommended Models

| Model | Size | Notes |
|---|---|---|
| `llama3.2` | ~2 GB | Best balance of speed and quality — recommended default |
| `qwen2.5` | ~4 GB | Excellent for code-heavy repos |
| `mistral` | ~4 GB | Fast, consistent output |
| `gemma2` | ~5 GB | Strong technical writing |
| `llama3.1` | ~4 GB | More detailed output, slightly slower |

The app auto-detects whichever models you have installed and lets you switch between them from the UI.

---

## Project Structure

```
readme-generator/
├── lib/
│   ├── github.js          # GitHub public API fetcher — all requests run in parallel
│   └── ollama.js          # Ollama client with token streaming
├── pages/
│   ├── index.jsx          # Frontend UI
│   └── api/
│       ├── generate.js    # SSE endpoint: fetches GitHub data → streams Ollama output
│       └── models.js      # Returns available Ollama models for the UI dropdown
├── .env.local             # Optional: GitHub token, custom Ollama host
├── next.config.js
└── package.json
```

---

## Configuration

Create `.env.local` in the project root (optional):

```env
# Raises GitHub API rate limit from 60 → 5000 req/hr
# Get one at https://github.com/settings/tokens (no scopes needed for public repos)
GITHUB_TOKEN=your_token_here

# Only needed if Ollama runs on a non-default port or remote machine
OLLAMA_HOST=http://localhost:11434
```

---

## Build for Production

```bash
npm run build
npm start
```

---

## Contributing

Contributions are welcome. Please open an issue before submitting a pull request for significant changes.

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push and open a PR

---

## Author

**Aarllen** — Computer Engineering student at Fr. C. Rodrigues Institute of Technology, Navi Mumbai.

[![GitHub](https://img.shields.io/badge/GitHub-aarllen-black?style=flat-square&logo=github)](https://github.com/aarllen)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-aarllen-0077B5?style=flat-square&logo=linkedin)](https://linkedin.com/in/aarllen)
[![Twitter](https://img.shields.io/badge/Twitter-aarllen-1DA1F2?style=flat-square&logo=twitter)](https://twitter.com/aarllen)

---

## License

[MIT](LICENSE) © Aarllen
