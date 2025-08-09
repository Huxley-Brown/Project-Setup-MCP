const fs = require('fs');
const path = require('path');

/**
 * Build Cursor MCP function call objects for preview (dry-run).
 */
function buildCreateCall(filePath, content) {
  return {
    name: 'create_file',
    arguments: {
      path: filePath,
      content: content
    }
  };
}

function buildEditCall(filePath, content) {
  return {
    name: 'edit_file',
    arguments: {
      path: filePath,
      content: content
    }
  };
}

function sanitizeAndResolve(filePath) {
  const posix = path.posix;
  let normalized = posix.normalize(filePath);
  if (posix.isAbsolute(normalized)) throw new Error('Absolute paths are not allowed');
  if (normalized.includes('..')) throw new Error('Parent directory (..) segments are not allowed');
  if (normalized.startsWith('./')) normalized = normalized.slice(2);

  const projectRoot = path.resolve(process.cwd());
  const resolved = path.resolve(projectRoot, normalized);
  if (!(resolved === projectRoot || resolved.startsWith(projectRoot + path.sep))) {
    throw new Error('Resolved path is outside the project root');
  }
  return { normalized, resolved };
}

/**
 * createFile writes to disk only when allowWrite=true. Otherwise returns a
 * Cursor MCP `create_file` call object for user approval.
 */
function createFile(filePath, content, options = {}) {
  const { allowWrite = false } = options;
  const { normalized, resolved } = sanitizeAndResolve(filePath);

  if (!allowWrite) return buildCreateCall(normalized, content);

  // perform actual write
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
  return { ok: true, path: normalized };
}

function editFile(filePath, content, options = {}) {
  const { allowWrite = false } = options;
  const { normalized, resolved } = sanitizeAndResolve(filePath);

  if (!allowWrite) return buildEditCall(normalized, content);

  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
  return { ok: true, path: normalized };
}

module.exports = { buildCreateCall, buildEditCall, createFile, editFile };


