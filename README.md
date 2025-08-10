# MCP Spec Generator (docs)

Minimal notes for running and developing the MCP spec‑generator tool.

### Requirements
- Node.js LTS (>=18)
- Provider API key (defaults to OpenAI):
  - `OPENAI_API_KEY` when using OpenAI (default)
  - Or `ANTHROPIC_API_KEY` when using Anthropic

### Quick notes
- Default LLM provider: OpenAI `gpt-5-2025-08-07`. Switch via `LLM_PROVIDER=anthropic` and set `ANTHROPIC_MODEL`.
- For safety, writes are disabled unless enabled. Use either `ALLOW_WRITE=1` in env or pass `allowWrite: true` per call.
- Example `.cursor/mcp.json` is included; prefer whitelisting only the project folder.

### Testing
- There are fixtures in `tests/fixtures/` to validate expected outputs.
- Run tests: `npm test`.

### CLI (optional local run)
- Dry‑run: `npm run cli -- "My project idea..."`
- Persist files: `ALLOW_WRITE=1 npm run cli -- "My project idea..."`

### Environment & setup
- Copy `env.example` to `.env` and set at least:
  - `OPENAI_API_KEY=sk-...` (or set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`)
  - Optional: `PROJECT_ROOT=/absolute/path/for/writes`
  - Optional: `ALLOW_WRITE=1` to enable automatic writes
- You can force the server to read a specific env file with `ENV_FILE=/abs/path/.env` in `.cursor/mcp.json`.

### Cursor MCP configuration
- Project‑level `.cursor/mcp.json` example:

```json
{
  "mcpServers": {
    "spec-generator": {
      "command": "node",
      "args": ["/home/huxley/Projects/ProjectSetup/src/mcp.mjs"],
      "env": {
        "LLM_PROVIDER": "openai",
        "OPENAI_MODEL": "gpt-5-2025-08-07",
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

### Security
- Never point writes at `~` or your entire home directory. Keep `PROJECT_ROOT` scoped to the current project.
