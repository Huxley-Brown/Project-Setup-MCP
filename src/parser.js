const path = require('path');

function parseAnthropicMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const headerMatch = lines[i].match(/^##\s+([^\n]+)$/i);
    if (!headerMatch) continue;

    const rawPath = headerMatch[1].trim();
    const sourceHeaderLine = i + 1;

    // Seek forward to find either a fenced code block or the next paragraph
    let j = i + 1;
    // Skip blank lines
    while (j < lines.length && lines[j].trim() === '') j++;
    // Skip an example label line like "**Example content:**"
    if (j < lines.length && /Example content/i.test(lines[j])) j++;
    while (j < lines.length && lines[j].trim() === '') j++;

    let content = '';

    if (j < lines.length && lines[j].trim().startsWith('```')) {
      // fenced code block
      let k = j + 1;
      const contentLines = [];
      while (k < lines.length && !lines[k].startsWith('```')) {
        contentLines.push(lines[k]);
        k++;
      }
      content = contentLines.join('\n').trim();
    } else {
      // contiguous paragraph block until blank line or next header
      let k = j;
      const contentLines = [];
      while (k < lines.length && lines[k].trim() !== '' && !lines[k].startsWith('## ')) {
        contentLines.push(lines[k]);
        k++;
      }
      content = contentLines.join('\n').trim();
    }

    // sanitize path using posix rules
    const posix = path.posix;
    let normalized = posix.normalize(rawPath);
    if (posix.isAbsolute(normalized)) continue; // reject absolute paths
    if (normalized.includes('..')) continue; // reject parent traversal
    if (normalized.startsWith('./')) normalized = normalized.slice(2);

    results.push({ path: normalized, content, sourceHeaderLine });
  }

  return results;
}

module.exports = { parseAnthropicMarkdown };


