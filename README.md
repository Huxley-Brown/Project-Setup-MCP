# MCP Spec Generator (docs)

Minimal notes for running and developing the MCP spec-generator tool described in this repo.

Requirements
- Node.js LTS (>=18)
- Environment variable: `ANTHROPIC_API_KEY` (store securely)

Quick notes
- The server communicates with Anthropic's `claude-4-sonnet-20240620` model. Keep temperature at `0.0` for deterministic output.
- Do not run with write permissions in production: MCP tools should return `create_file`/`edit_file` calls for user approval in Cursor.
- Example `.cursor/mcp.json` is provided in the repo as a template. When configuring, whitelist only the project folder.

Testing
- There are fixtures in `tests/fixtures/` to validate the expected Markdown outputs from the model.

How to run
- Run tests: `node tests/run_tests.js` or `npm test`.
- Dry-run (propose files): `node index.js "My project idea..."`
- Persist files: `node index.js "My project idea..." --allow-write`
- Read prompt from stdin: `echo "My idea" | node index.js`

Linting & formatting
- ESLint and Prettier configs are included. To lint/format locally run:
  - `npm run lint`
  - `npm run format`

Environment & setup (required)
- Set your Anthropic API key in the environment before running the tool:
  - Linux/macOS: `export ANTHROPIC_API_KEY=sk-...`
  - Windows (PowerShell): `setx ANTHROPIC_API_KEY "sk-..."`
- Optionally copy `env.example` to `.env` or export additional overrides like `MCP_AUDIT_FILE` or `ANTHROPIC_TIMEOUT_MS`.
- Make the CLI executable if you prefer: `chmod +x index.js`

Cursor MCP configuration
- The repo includes `.cursor/mcp.json` configured to whitelist the project path. Verify it points to your repository root before registering with Cursor.

Security
- Never point the Filesystem MCP server at `~` or your home directory. Whitelist only the necessary project paths.


