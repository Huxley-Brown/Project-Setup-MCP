const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIT_FILE = process.env.MCP_AUDIT_FILE || path.join(process.cwd(), '.mcp-audit.log');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function hashPrompt(prompt) {
  return crypto.createHash('sha256').update(prompt || '').digest('hex').slice(0, 12);
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return;
    const stat = fs.statSync(AUDIT_FILE);
    if (stat.size <= MAX_BYTES) return;
    const ts = Date.now();
    const dest = `${AUDIT_FILE}.${ts}`;
    fs.renameSync(AUDIT_FILE, dest);
  } catch (e) {
    // best-effort, do not throw in auditing
  }
}

function logAudit({ prompt, systemPromptVersion, parsedFiles }) {
  try {
    rotateIfNeeded();
    const entry = {
      ts: new Date().toISOString(),
      systemPromptVersion: systemPromptVersion || null,
      promptHash: hashPrompt(prompt),
      files: (parsedFiles || []).map(f => ({ path: f.path, contentLength: (f.content || '').length }))
    };
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    // swallow errors
  }
}

module.exports = { logAudit };


