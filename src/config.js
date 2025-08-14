const path = require('path');
const dotenv = require('dotenv');

// Load env from multiple locations to support both global-server and per-project setups
// 1) current working directory (the project you have open in Cursor)
dotenv.config();
// 2) optional .env.local in CWD
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false });
// 3) server repo root (where this code lives)
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: false });
// 4) explicit path via ENV_FILE for advanced setups
if (process.env.ENV_FILE) {
  dotenv.config({ path: process.env.ENV_FILE, override: false });
}

// Determine a sensible project root for writing outputs
function fileExists(p) {
  try { return require('fs').existsSync(p); } catch (_) { return false; }
}

function findProjectRoot(startDir) {
  let dir = startDir;
  const { sep, resolve, dirname } = path;
  while (true) {
    // Priority: project-local MCP config → git repo → .env → package.json
    if (fileExists(resolve(dir, '.cursor', 'mcp.json'))) return dir;
    if (fileExists(resolve(dir, '.git'))) return dir;
    if (fileExists(resolve(dir, '.env'))) return dir;
    if (fileExists(resolve(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

// Compute effective project root with multiple fallbacks
const envProjectRoot = process.env.PROJECT_ROOT || process.env.WRITE_ROOT || '';
const projectRootFromEnvFile = process.env.ENV_FILE ? path.dirname(process.env.ENV_FILE) : '';
const computedProjectRoot = path.resolve(
  envProjectRoot || projectRootFromEnvFile || findProjectRoot(process.cwd())
);

// Export this to downstream modules that rely on env
if (!process.env.PROJECT_ROOT) {
  process.env.PROJECT_ROOT = computedProjectRoot;
}

const config = {
  provider: process.env.LLM_PROVIDER || 'openai', // default to OpenAI
  model: process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || 'gpt-5-2025-08-07',
  temperature: Number(process.env.ANTHROPIC_TEMPERATURE || 0.0),
  timeoutMs: Number(process.env.ANTHROPIC_TIMEOUT_MS || 15000),
  maxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES || 3),
  baseDelayMs: Number(process.env.ANTHROPIC_BASE_DELAY_MS || 500),
  maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 20000),
  allowWrite: process.env.ALLOW_WRITE === '1',
  projectRoot: computedProjectRoot,
  systemPromptPath: path.resolve(__dirname, '..', 'system-prompt.md')
};

module.exports = { config };


