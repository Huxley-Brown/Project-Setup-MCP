const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const { config } = require('./config');
const { callAnthropic } = require('./anthropic');
const { callOpenAI } = require('./openai');
const { buildCreateCall, createFile } = require('./repomix');

const ajv = new Ajv({ allErrors: true, strict: false });
const structureSchema = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'schemas', 'structure.schema.json'), 'utf8')
);
const filesSchema = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'schemas', 'files.schema.json'), 'utf8')
);
const validateStructure = ajv.compile(structureSchema);
const validateFiles = ajv.compile(filesSchema);

function extractJson(text) {
  // 1) Attempt direct parse
  try { return JSON.parse(text); } catch (_) {}

  let trimmed = String(text || '').replace(/^\uFEFF/, '').trim();

  // 2) Strip fenced blocks ```json ... ``` or ``` ... ``` (any language tag)
  const fenceRegex = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/i;
  const fenceMatch = trimmed.match(fenceRegex);
  if (fenceMatch && fenceMatch[1]) {
    const inner = fenceMatch[1].trim();
    try { return JSON.parse(inner); } catch (_) {
      // try with trailing-comma cleanup
      const cleaned = inner.replace(/,(\s*[}\]])/g, '$1');
      try { return JSON.parse(cleaned); } catch (_) {}
    }
  }

  // 3) Balanced-brace extraction of first JSON object
  const start = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (start !== -1 && last !== -1 && last > start) {
    // try largest slice first (in case of trailing garbage)
    const largest = trimmed.slice(start, last + 1);
    try { return JSON.parse(largest); } catch (_) {}

    let i = start;
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inStr) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') { depth++; }
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = trimmed.slice(start, i + 1);
          try { return JSON.parse(candidate); } catch (_) {
            // try with trailing-comma cleanup
            const cleaned = candidate.replace(/,(\s*[}\]])/g, '$1');
            try { return JSON.parse(cleaned); } catch (_) { break; }
          }
        }
      }
    }
  }

  throw new Error('Failed to parse JSON from model output');
}

function buildStructureUserPrompt(userPrompt) {
  return [
    'Return ONLY JSON (no prose, no markdown fences).',
    'Exact shape (copy exactly):',
    '{ "folders": ["..."], "files": { "path": "" } }',
    'Critical rules:',
    '- In the "files" object, every value MUST be an empty string "" (no content).',
    '- Relative paths only. Do not include ".." or absolute paths.',
    '- Produce valid minified JSON (no trailing commas, no comments).',
    'User request:',
    userPrompt
  ].join('\n');
}

function buildContentUserPrompt(userPrompt, structure) {
  return [
    'Given the confirmed structure below, return ONLY JSON of the form { "files": { "<path>": "<content>" } } for the listed files.',
    'Requirements for validity:',
    '- JSON only; no markdown or prose.',
    '- All values must be valid JSON strings: replace every newline with \\n and escape every double quote as \\\".',
    '- Relative paths only. Do not add extra keys.',
    'Structure:',
    JSON.stringify(structure, null, 2),
    'User request:',
    userPrompt
  ].join('\n');
}

function buildContentBatchPrompt(userPrompt, paths) {
  return [
    'Return ONLY JSON of the form { "files": { "<path>": "<content>" } } for the listed files. No prose, no markdown fences.',
    'Validity rules:',
    '- All values must be valid JSON strings: replace every newline with \\n and escape every double quote as \\\".',
    '- Only include these exact paths and no others:',
    ...paths.map((p) => `- ${p}`),
    'User request:',
    userPrompt
  ].join('\n');
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function writeRunText(runId, label, content) {
  try {
    const cwdRuns = path.resolve(process.cwd(), '.runs');
    const repoRuns = path.resolve(__dirname, '..', '.runs');
    for (const dir of [cwdRuns, repoRuns]) {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${runId}-${label}.txt`), String(content ?? ''), 'utf8');
      } catch (_) { /* best-effort per dir */ }
    }
  } catch (_) { /* best-effort */ }
}

async function generateStructure(userPrompt, runId) {
  const systemPrompt = fs.readFileSync(config.systemPromptPath, 'utf8');
  const llmCall = config.provider === 'openai' ? callOpenAI : callAnthropic;
  const text = await llmCall({
    systemPrompt,
    userPrompt: buildStructureUserPrompt(userPrompt),
    model: config.model,
    temperature: config.temperature,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    baseDelayMs: config.baseDelayMs
  });
  if (typeof text !== 'string') {
    throw new Error('Model response was not text');
  }
  writeRunText(runId, 'structure.raw', text);
  const json = extractJson(text);
  // Normalize: keep only file paths and ensure empty content for structure step
  const files = json && json.files && typeof json.files === 'object' ? Object.keys(json.files) : [];
  const normalized = {
    folders: Array.isArray(json.folders) ? json.folders : ['specs', 'docs'],
    files: files.reduce((acc, p) => { acc[p] = ""; return acc; }, {})
  };
  const ok = validateStructure(normalized);
  if (!ok) throw new Error('Structure JSON failed validation: ' + ajv.errorsText(validateStructure.errors));
  return normalized;
}

async function generateContents(userPrompt, structure, runId) {
  const systemPrompt = fs.readFileSync(config.systemPromptPath, 'utf8');
  const allPaths = Object.keys(structure.files || {});
  const batches = chunkArray(allPaths, 3);
  const merged = {};
  for (let i = 0; i < batches.length; i++) {
    const prompt = buildContentBatchPrompt(userPrompt, batches[i]);
    const llmCall2 = config.provider === 'openai' ? callOpenAI : callAnthropic;
    const text = await llmCall2({
      systemPrompt,
      userPrompt: prompt,
      model: config.model,
      temperature: config.temperature,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      baseDelayMs: config.baseDelayMs
    });
    if (typeof text !== 'string') {
      throw new Error('Model response was not text');
    }
    writeRunText(runId, `files.batch-${i + 1}.raw`, text);
    const json = extractJson(text);
    const ok = validateFiles(json);
    if (!ok) throw new Error('Files JSON failed validation: ' + ajv.errorsText(validateFiles.errors));
    Object.assign(merged, json.files);
  }
  return merged;
}

function proposeCreatesFromFiles(filesMap) {
  const proposals = [];
  for (const [filePath, content] of Object.entries(filesMap)) {
    proposals.push(buildCreateCall(filePath, content));
  }
  return proposals;
}

async function materialize(filesMap, { allowWrite = false } = {}) {
  const results = [];
  for (const [filePath, content] of Object.entries(filesMap)) {
    results.push(createFile(filePath, content, { allowWrite }));
  }
  return results;
}

async function generateProject(userPrompt, { allowWrite = false, saveRun = true } = {}) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.resolve(process.cwd(), '.runs');
  if (saveRun && !fs.existsSync(runDir)) fs.mkdirSync(runDir, { recursive: true });

  const structure = await generateStructure(userPrompt, ts);
  const filesMap = await generateContents(userPrompt, structure, ts);

  const proposals = proposeCreatesFromFiles(filesMap);

  if (saveRun) {
    const artifact = { timestamp: ts, params: { model: config.model }, structure, files: Object.keys(filesMap) };
    fs.writeFileSync(path.join(runDir, `${ts}.json`), JSON.stringify(artifact, null, 2));
  }

  if (!allowWrite) return proposals;
  return materialize(filesMap, { allowWrite: true });
}

module.exports = { generateStructure, generateContents, generateProject };


