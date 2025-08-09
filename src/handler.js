const fs = require('fs');
const path = require('path');
const { parseAnthropicMarkdown } = require('./parser');
const { buildCreateCall, createFile } = require('./repomix');
const { logAudit } = require('./audit');
const { SYSTEM_PROMPT_VERSION } = require('./constants');

async function handlePrompt(userPrompt, options = {}) {
  const systemPromptPath = options.systemPromptPath || path.join(__dirname, '..', 'system-prompt.md');
  const anthropicCall = options.anthropicCall || require('./anthropic').callAnthropic;
  const allowWrite = !!options.allowWrite;

  const systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
  const response = await anthropicCall({ systemPrompt, userPrompt });

  const files = parseAnthropicMarkdown(response || '');

  // filter again for safety: non-empty content and sanitized paths
  const safeFiles = files.filter(f => f.path && f.content && f.content.trim());

  // Audit the parsed output (best-effort)
  try {
    logAudit({ prompt: userPrompt, systemPromptVersion: SYSTEM_PROMPT_VERSION, parsedFiles: safeFiles });
  } catch (e) {
    // swallow errors
  }

  if (allowWrite) {
    // perform writes (returns array of write results)
    const results = safeFiles.map(f => createFile(f.path, f.content, { allowWrite: true }));
    return results;
  }

  const calls = safeFiles.map(f => buildCreateCall(f.path, f.content));
  return calls;
}

module.exports = { handlePrompt };


