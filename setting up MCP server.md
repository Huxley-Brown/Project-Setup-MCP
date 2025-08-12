# Setting up the Spec‑Generator MCP Server (Local, Secure, and Reliable)

This guide explains how to run the spec‑generator as a local MCP (Model Context Protocol) server for Cursor. It consolidates all working practices in this repo: environment loading, OpenAI (GPT‑5) default provider, optional Anthropic, safe write behavior, strict JSON prompting with schemas, batching to avoid truncation, and reliable tool registration.

## What this server does
- Exposes one MCP tool: `generate_project`
- Input: `{ prompt: string, allowWrite?: boolean }`
- Generates a project spec (structure + contents) using your configured LLM
- Preview mode (default) returns proposals; write mode persists files to disk
- Saves run artifacts under `.runs/` (raw model outputs, per‑run index JSON)

## Transport and process model
- Transport: STDIO (local). Cursor spawns `node src/mcp.mjs` and communicates over stdio.
- No HTTP server required. LLM requests go to OpenAI/Anthropic over the network.

---

## Prerequisites
- Node.js ≥ 18
- This repo cloned locally
- Provider API key(s)
  - OpenAI (default): `OPENAI_API_KEY`
  - Anthropic (optional): `ANTHROPIC_API_KEY`

Install dependencies once:
```bash
npm ci
```

---

## Key files in this repo
- `src/mcp.mjs`: MCP server entrypoint (STDIO) with `generate_project` tool
- `src/orchestrator.js`: two‑step/batched orchestration with strict JSON prompts and schema validation
- `src/openai.js`: OpenAI client (GPT‑5)
- `src/anthropic.js`: Anthropic client
- `src/config.js`: central configuration and dotenv loading
- `src/repomix.js`: file proposal/write wrapper with path sanitization
- `system-prompt.md`: single source prompt (WBS guidance + strict JSON schemas + constraints)
- `schemas/*.json`: JSON Schemas for structure and content outputs
- `.cursor/mcp.json`: example MCP configuration
- `env.example`: environment template
- `.runs/`: run artifacts directory

---

## Environment loading (keep secrets in .env)
The server loads env in this order (first that exists wins):
1) Current working directory (CWD): `.env`
2) CWD: `.env.local` (optional)
3) Repo root (this repo): `./.env`
4) Explicit file via `ENV_FILE=/absolute/path/to/.env` (recommended)

Recommendation: keep API keys only in `.env`. Use `ENV_FILE` in `.cursor/mcp.json` so the server reads your project’s `.env` without embedding secrets in JSON.

### Recommended `.env`
Copy `env.example` to `.env` and set values:
```bash
# Provider (default: OpenAI)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-2025-08-07
OPENAI_MAX_TOKENS=20000
# Leave OPENAI_TEMPERATURE unset unless required (some GPT‑5 endpoints reject it)

# Optional: Anthropic (only if switching provider)
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=...
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
# ANTHROPIC_MAX_TOKENS=20000

# Writing behavior
ALLOW_WRITE=0                               # set to 1 to enable automatic writes
PROJECT_ROOT=/absolute/path/to/your/project # write target; defaults to CWD
```
Security: never commit `.env` to git.

---

## MCP configuration (Cursor)
Configure globally (`~/.cursor/mcp.json`) or per‑project (`<project>/.cursor/mcp.json`). Use `ENV_FILE` so the server reads your project’s `.env`, and set `PROJECT_ROOT` so writes land in the right folder even if the server runs elsewhere.

### Project‑level `.cursor/mcp.json` (example)
```json
{
  "mcpServers": {
    "spec-generator": {
      "command": "node",
      "args": ["/home/huxley/Projects/ProjectSetup/src/mcp.mjs"],
      "env": {
        "ENV_FILE": "/absolute/path/to/your/project/.env",
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

### Global `~/.cursor/mcp.json` (example)
```json
{
  "mcpServers": {
    "spec-generator": {
      "command": "node",
      "args": ["/home/huxley/Projects/ProjectSetup/src/mcp.mjs"],
      "env": {
        "ENV_FILE": "/absolute/path/to/your/project/.env",
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```
After editing MCP config, restart Cursor (or toggle MCP in Settings) so it respawns the process.

---

## Provider configuration
### OpenAI (default)
- Set `LLM_PROVIDER=openai`
- Required: `OPENAI_API_KEY`
- Optional: `OPENAI_MODEL` (defaults to `gpt-5-2025-08-07`)
- Optional: `OPENAI_MAX_TOKENS` (default 20000)
- Temperature: omitted by default; set `OPENAI_TEMPERATURE` only if required

### Anthropic (optional)
- Set `LLM_PROVIDER=anthropic`
- Required: `ANTHROPIC_API_KEY`
- Optional: `ANTHROPIC_MODEL` (`claude-sonnet-4-20250514`), `ANTHROPIC_MAX_TOKENS`, `ANTHROPIC_TIMEOUT_MS`, `ANTHROPIC_MAX_RETRIES`

---

## Writing files safely
- The server writes only when enabled:
  - Per‑call: pass `allowWrite: true`
  - Or env default: `ALLOW_WRITE=1` in `.env`
- Root directory for writes:
  - Defaults to `process.cwd()`
  - Override with `PROJECT_ROOT` (or `WRITE_ROOT`) to force a specific folder
- Path sanitization (`src/repomix.js`):
  - Rejects absolute paths and `..` segments
  - Ensures resolved path stays inside `PROJECT_ROOT`
If writes do not occur even with `allowWrite: true`, check MCP Logs for “Resolved path is outside the project root” and adjust `PROJECT_ROOT`.

---

## Prompting, schemas, and batching
- `system-prompt.md` includes:
  - Work Breakdown Structure (WBS) guidance: 3–5 top‑level tasks, 3–7 subtasks; lowercase, hyphenated slugs; safe charset for paths
  - Strict JSON schemas and examples for both steps
  - Explicit escaping rules (no fences; use `\n` for newlines; escape quotes)
  - Reminder: do not output Markdown/WBS tree in JSON mode
- Orchestration:
  - Step 1 (structure): JSON only; file values must be empty strings; validated against schema; normalized to `{ path: "" }`
  - Step 2 (contents): requested in small batches (default 3 paths per request) to avoid truncation; merged and validated
- Tokens:
  - Defaults allow large outputs (`*_MAX_TOKENS` 20000); batching is the primary guard against truncation

---

## Using the tool in Cursor
- The MCP server advertises one tool: `generate_project`
- In chat:
  - Natural: “Use spec‑generator to generate a full spec for a Next.js blog.”
  - Explicit: call with `{ prompt: "Build X", allowWrite: true }`
- You’ll see either:
  - Text containing the JSON array of write results (if `allowWrite` is true)
  - Or JSON proposals (as text) for preview mode

---

## Run artifacts (`.runs/`)
For each run, the server writes artifacts for debugging:
- `YYYY-MM-DDTHH-MM-SS-ms-structure.raw.txt`: raw structure response
- `YYYY-MM-DDTHH-MM-SS-ms-files.batch-N.raw.txt`: raw content responses per batch
- `YYYY-MM-DDTHH-MM-SS-ms.json`: index with model params and final file list
Artifacts are written to both:
- The current project (`$PROJECT_ROOT/.runs` or `CWD/.runs`)
- The repo folder where the server lives (`/path/to/ProjectSetup/.runs`)

---

## Troubleshooting
- “No tools or prompts”
  - Ensure Node ≥ 18, run `npm ci`, and restart Cursor
  - Confirm `.cursor/mcp.json` uses the correct absolute path to `src/mcp.mjs`
  - Check MCP Logs for startup errors
- API key missing
  - Prefer `.env`; point to it via `ENV_FILE` in MCP config
  - Verify the key is visible to the spawned process (MCP Logs)
- “Unsupported parameter: 'temperature'” (OpenAI GPT‑5)
  - Unset `OPENAI_TEMPERATURE` (server omits it by default)
- “Failed to parse JSON”
  - Check `.runs/*-structure.raw.txt` and `*-files.batch-*.raw.txt`
  - The server tolerates fenced blocks, trailing commas, and trailing garbage; batching prevents overly long responses
  - If content still fails, reduce batch size or simplify prompts
- Tool returns content but no files
  - Enable writes (`ALLOW_WRITE=1` or `allowWrite: true`)
  - Set `PROJECT_ROOT` so resolved paths are inside the intended project
  - Review MCP Logs for sanitizer errors

---

## Example end‑to‑end (local project)
1) Prepare `.env` in your project:
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-2025-08-07
ALLOW_WRITE=1
PROJECT_ROOT=/home/you/Projects/MyProject
```
2) Project `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "spec-generator": {
      "command": "node",
      "args": ["/home/you/Project-Setup-MCP/src/mcp.mjs"],
      "env": {
        "ENV_FILE": "/home/you/Projects/MyProject/.env",
        "PROJECT_ROOT": "/home/you/Projects/MyProject"
      }
    }
  }
}
```
3) Restart Cursor, open chat, and run:
- “Use spec‑generator → generate_project with { prompt: 'Build a minimal static site generator in Node' }”
Files will be written under `/home/you/Projects/MyProject/specs` and `/home/you/Projects/MyProject/docs`.

---

## Security best practices
- Keep secrets in `.env`; avoid storing keys in MCP config
- Scope writes with `PROJECT_ROOT`; never point at your home directory
- Review tool behavior before enabling auto‑writes (`ALLOW_WRITE=1`)
- Keep dependencies and Node up to date; pin model IDs explicitly via env

---

## Appendix: Implementation notes
- Tool registration uses `ListToolsRequestSchema` and `CallToolRequestSchema` for maximum SDK compatibility. Tool output is returned as `{ type: 'text', text: JSON.stringify(results) }` to satisfy schema validators.
- The orchestrator validates structure and content JSON against schemas in `schemas/` and normalizes structure values to empty strings during the structure step.
- Content is fetched in small batches to reduce truncation and simplify JSON extraction; raw artifacts make debugging straightforward.
