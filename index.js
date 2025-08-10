#!/usr/bin/env node
// load environment early
require('dotenv').config();
const { handlePrompt } = require('./src/handler');
const { logAudit } = require('./src/audit');
const { SYSTEM_PROMPT_VERSION } = require('./src/constants');

async function main() {
  let args = process.argv.slice(2);

  // support --audit-file <path>
  const auditIdx = args.indexOf('--audit-file');
  if (auditIdx !== -1) {
    const val = args[auditIdx + 1];
    if (val) {
      process.env.MCP_AUDIT_FILE = val;
      // remove flag and value
      args = args.slice(0, auditIdx).concat(args.slice(auditIdx + 2));
    }
  }

  // if no args provided, attempt to read prompt from stdin
  if (args.length === 0) {
    const stdin = await new Promise((resolve) => {
      let data = '';
      if (process.stdin.isTTY) return resolve('');
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data.trim()));
    });
    if (stdin) args = [stdin];
  }

  if (args.length === 0) {
    console.error('Usage: node index.js "<user prompt>" [--allow-write] [--audit-file <path>]');
    process.exit(2);
  }

  const allowWrite = args.includes('--allow-write');
  const prompt = args.filter(a => a !== '--allow-write').join(' ');

  try {
    const result = await handlePrompt(prompt, { allowWrite });
    if (allowWrite) {
      console.error(`Wrote ${Array.isArray(result) ? result.length : 0} files. Audit log: .mcp-audit.log (version=${SYSTEM_PROMPT_VERSION})`);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`Dry-run: proposing ${Array.isArray(result) ? result.length : 0} file(s). Use --allow-write to persist. Audit log: .mcp-audit.log (version=${SYSTEM_PROMPT_VERSION})`);
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (e) {
    console.error('Error:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

if (require.main === module) main();


