# Prompt: Build an MCP Server That Generates Project Specs via Claude4-Sonnet and Repomix

## Introduction

You are a senior software engineer tasked with building a **Model Context Protocol (MCP) server** for use inside **Cursor**. This server enables **natural language prompts** to generate full project specification files using Anthropic's `claude-4-sonnet-20240620` model.

The MCP server will receive a user message, send it to Anthropic's API (with a static system prompt), parse the Markdown file structure returned, and use Repomix to create those files locally.

---

## Project Goals

- Accept user prompts like:

> I want to build a simple HTML site for my t-shirt drop shipping business.

- Forward that to Anthropic's Claude4-Sonnet with an embedded **system prompt**
- Receive a Markdown-based file structure and file contents
- Parse that Markdown into files
- Use **Repomix** to write those files to the local repo
- Return function calls (`create_file`, `edit_file`) back to Cursor for approval

---

## Functional Requirements

### 1. MCP Server

- Interface: STDIO transport
- Language: JavaScript/TypeScript (Node.js preferred)
- Must conform to Cursor's MCP server expectations
- Must output `create_file` and `edit_file` calls to Cursor

---

### 2. System Prompt Handling

- The system prompt is static and defined in the codebase
- On each API call, insert it before the user message:

```javascript
await client.messages.create({
  model: "claude-4-sonnet-20240620",
  temperature: 0.0,
  messages: [
    { role: "system", content: "<STATIC_SYSTEM_PROMPT>" },
    { role: "user", content: "<USER_QUERY>" }
  ]
});
```

- Load the system prompt from a local `.md` file, e.g.:

```javascript
const prompt = fs.readFileSync("./system-prompt.md", "utf8");
```

### 3. Anthropic Integration

- Use `fetch()` to call the Anthropic API
- Model: `claude-4-sonnet-20240620`
- Temperature: `0.0`

### 4. Response Parsing

Claude4-Sonnet returns structured Markdown with:

- A file tree
- File headers like `## specs/overview.md`
- Labeled code blocks under each header (`**Example content:**`)

Parse that into an array of:

```javascript
{
  path: "specs/overview.md",
  content: "...string..."
}
```

### 5. File Creation (Repomix Integration)

- Integrate Repomix as a library, not as an MCP server
- Use its file APIs directly:

```javascript
await repomix.createFile(path, content);
```

### 6. Return Function Calls to Cursor

- Do not write files directly without approval
- Return `create_file` or `edit_file` calls to Cursor like:

```json
{
  "name": "create_file",
  "arguments": {
    "path": "specs/overview.md",
    "content": "..."
  }
}
```

- Cursor will preview and confirm before applying

---

## File Structure Example

```
/your-mcp-server/
├── index.ts (main STDIO MCP handler)
├── anthropic.ts (Claude-4-Sonnet API logic)
├── parser.ts (Markdown parsing logic)
├── repomix.ts (wrapper for file creation)
├── system-prompt.md
└── package.json
```

---

## Development Tips

- Use the `mcp-stdio` library or model after other Cursor tools like repomix
- Assume you are parsing raw Markdown — no structured JSON or YAML
- Keep system prompt improvements versioned — it's critical to final output quality
- Test using the Composer panel inside Cursor

---

## Outcome

By the end of the project, Cursor will support a tool named "spec-generator" that:

1. Accepts a user's idea
2. Sends it to Claude4-Sonnet (with static system prompt)
3. Receives a Markdown file structure
4. Parses and proposes file creation via Repomix

All of this will run automatically in a Cursor workflow, with user-in-the-loop confirmation.

*(Context: "This tool enables anyone to go from a vague idea to a structured, spec-compliant code project scaffold in seconds. It will be the most productive AI workflow in Cursor.")*

## Implementation details & checklist (minimal, high-impact)

These are small, focused items to implement next. Follow the principle of least change and prefer explicit tests/fixtures over guessing behavior.

- **Parser design**: implement a tolerant parser with these characteristics:
  - Locate file headers by matching `^##\s+([^\n]+)$` (case-insensitive), treat the captured text as a relative path.
  - For each header, take the first fenced code block that follows (languages allowed: `markdown`, `text`, `bash`, `gherkin`). If no fence exists, capture the next contiguous paragraph block.
  - Sanitize the extracted path: normalize, reject absolute paths, and reject any `..` segments. Enforce creation only inside the project root.
  - Validate content length and non-empty body. Return an array of `{ path, content, sourceHeaderLine }` for downstream validation and UI preview.
  - Keep the parser deterministic and well-covered by unit tests (see fixtures below).

- **Path validation & sanitization**: canonicalize with `path.posix.normalize`, then ensure `!path.isAbsolute` and `!path.includes('..')`. Map all paths to an allowed whitelist rooted at the configured project folder.

- **Anthropic integration hardening**:
  - Require `ANTHROPIC_API_KEY` via env var. Document in `README.md`.
  - Use `fetch()` with a configurable timeout, and implement exponential backoff with jitter (e.g., 3 retries, base delay 500ms).
  - Surface clear errors for 4xx vs 5xx responses and log response bodies for debugging.

- **Repomix abstraction**: provide a small wrapper API surface (conceptual only):
  - `async function createFile(path: string, content: string): Promise<void>`
  - `async function editFile(path: string, content: string): Promise<void>`
  - Keep the wrapper in its own module so replacing the underlying implementation is trivial.

- **Safety / user-in-loop enforcement**:
  - Always return Cursor MCP `create_file` / `edit_file` function calls for user approval; never perform writes unless a developer-only `--allow-write` flag is explicitly passed for local testing.

- **Tests & fixtures**:
  - Add a small `tests/fixtures/` set containing:
    - `anthropic_good.md`: well-formed folder tree + headers + fenced content.
    - `anthropic_malformed.md`: missing fences, extra prose, and a bad path containing `..` to validate sanitization.
  - Unit tests should assert the parser returns the expected file array and rejects/sanitizes unsafe paths.

- **Minimal repo scaffolding**:
  - Provide these minimal files (docs only for now): `package.json` (placeholder), `README.md`, and `.cursor/mcp.json` example to document safe config.

- **Logging & audit trail**:
  - Record each proposed `create_file`/`edit_file` call to a local append-only audit log with timestamp, model prompt (hashed or truncated), and parsed output; rotate logs by size or time.

- **Prompt determinism & versioning**:
  - Lock model params (temperature 0.0) in code; track `system-prompt.md` in the repo and add a `SYSTEM_PROMPT_VERSION` constant to include in the audit trail.

- **Verify external APIs**:
  - Confirm the exact Repomix library API surface and the Anthropic HTTP payload shape before implementing wrappers. Document the exact endpoints and response shapes in `Project plan.md` or `IMPLEMENTATION_NOTES.md`.

These changes keep code edits minimal while providing a clear, testable implementation path. The fixtures below are a starting point to validate parsing behavior.