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

const config = {
  provider: process.env.LLM_PROVIDER || 'openai', // default to OpenAI
  model: process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || 'gpt-5-2025-08-07',
  temperature: Number(process.env.ANTHROPIC_TEMPERATURE || 0.0),
  timeoutMs: Number(process.env.ANTHROPIC_TIMEOUT_MS || 15000),
  maxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES || 3),
  baseDelayMs: Number(process.env.ANTHROPIC_BASE_DELAY_MS || 500),
  maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 20000),
  allowWrite: process.env.ALLOW_WRITE === '1',
  projectRoot: process.cwd(),
  systemPromptPath: path.resolve(__dirname, '..', 'system-prompt.md')
};

module.exports = { config };


