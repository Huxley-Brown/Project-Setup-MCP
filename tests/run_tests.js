const fs = require('fs');
const assert = require('assert');
const path = require('path');
const { parseAnthropicMarkdown } = require('../src/parser');
const { buildCreateCall, buildEditCall, createFile, editFile } = require('../src/repomix');
const { callAnthropic } = require('../src/anthropic');
const { handlePrompt } = require('../src/handler');

function readFixture(name) {
  const p = path.join(__dirname, 'fixtures', name);
  return fs.readFileSync(p, 'utf8');
}

(async function main() {
  try {
    const good = readFixture('anthropic_good.md');
    const resGood = parseAnthropicMarkdown(good);
    const pathsGood = resGood.map(r => r.path);
    assert(pathsGood.includes('specs/overview.md'), 'should include specs/overview.md');
    assert(pathsGood.includes('specs/tasks.md'), 'should include specs/tasks.md');

    const bad = readFixture('anthropic_malformed.md');
    const resBad = parseAnthropicMarkdown(bad);
    const pathsBad = resBad.map(r => r.path);
    assert(pathsBad.includes('specs/overview.md'), 'malformed should capture overview');
    // ensure unsafe path is rejected
    assert(!pathsBad.some(p => p.includes('..')), 'should reject unsafe paths containing ..');

    // repomix wrapper should return correctly shaped function calls
    const sampleCall = buildCreateCall('specs/overview.md', '# hi');
    assert(sampleCall && sampleCall.name === 'create_file', 'repomix create must be named create_file');
    assert(sampleCall.arguments && sampleCall.arguments.path === 'specs/overview.md', 'repomix create path');

    // repomix dry-run createFile
    const dry = createFile('specs/dry-run.md', 'hello');
    assert(dry && dry.name === 'create_file', 'createFile dry-run should return create_file call');

    // repomix write-mode createFile
    const tmpDir = path.join(__dirname, 'tmp');
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (e) {}
    const writePath = path.join('tests', 'tmp', 'write_test.md');
    const writeContent = 'written-content';
    const res = createFile(writePath, writeContent, { allowWrite: true });
    assert(res && res.ok, 'createFile should return ok when writing');
    const absWritten = path.join(process.cwd(), writePath);
    assert(fs.existsSync(absWritten), 'written file should exist');
    const got = fs.readFileSync(absWritten, 'utf8');
    assert(got === writeContent, 'written file content should match');
    // cleanup
    try { fs.unlinkSync(absWritten); } catch (e) {}

    // Anthropic client tests
    const origApiKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    let threw = false;
    try {
      await callAnthropic({ systemPrompt: 's', userPrompt: 'u', timeoutMs: 1000, maxRetries: 1 });
    } catch (e) {
      threw = true;
      assert(/ANTHROPIC_API_KEY/.test(e.message), 'should complain about missing API key');
    }
    assert(threw, 'callAnthropic should throw when API key missing');

    // success path with mocked fetch
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({ completion: 'hello-from-api' }) });
    const resp = await callAnthropic({ systemPrompt: 's', userPrompt: 'u', timeoutMs: 1000, maxRetries: 1 });
    assert(resp === 'hello-from-api', 'should return completion text from mock');
    global.fetch = origFetch;
    if (origApiKey) process.env.ANTHROPIC_API_KEY = origApiKey; else delete process.env.ANTHROPIC_API_KEY;

    // retry/backoff behavior: fail twice then succeed
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.ANTHROPIC_BASE_DELAY_MS = '1';
    let count = 0;
    const origFetch2 = global.fetch;
    global.fetch = async () => {
      count += 1;
      if (count < 3) return { ok: false, status: 500, json: async () => ({ error: 'server' }) };
      return { ok: true, json: async () => ({ completion: 'eventual-success' }) };
    };
    const eventual = await callAnthropic({ systemPrompt: 's', userPrompt: 'u', timeoutMs: 1000, maxRetries: 3 });
    assert(eventual === 'eventual-success', 'should eventually succeed after retries');
    global.fetch = origFetch2;
    delete process.env.ANTHROPIC_BASE_DELAY_MS;

    // handler integration test (injecting mocked anthropic response)
    const calls = await handlePrompt('user', { anthropicCall: async () => readFixture('anthropic_good.md') });
    assert(Array.isArray(calls), 'handler should return an array of function calls');
    assert(calls.some(c => c.arguments && c.arguments.path === 'specs/overview.md'), 'handler should include specs/overview.md');

    // handler write-mode integration: should write files under project root
    const writeResults = await handlePrompt('user', { anthropicCall: async () => readFixture('anthropic_good.md'), allowWrite: true });
    assert(Array.isArray(writeResults), 'writeResults should be an array');
    // check that at least one write reported ok and file exists
    const wroteOne = writeResults.some(r => r && r.ok);
    assert(wroteOne, 'at least one file should be written');
    // clean up created files (specs/ directory)
    const specsDir = path.join(process.cwd(), 'specs');
    if (fs.existsSync(specsDir)) {
      // delete files recursively
      function rmrf(p) {
        if (fs.statSync(p).isDirectory()) {
          for (const child of fs.readdirSync(p)) rmrf(path.join(p, child));
          fs.rmdirSync(p);
        } else {
          fs.unlinkSync(p);
        }
      }

    // extra parser edge-case tests
    const extra = readFixture('anthropic_extra.md');
    const resExtra = parseAnthropicMarkdown(extra);
    const pathsExtra = resExtra.map(r => r.path);
    assert(pathsExtra.includes('specs/multi-fence.md'), 'should include multi-fence');
    const multi = resExtra.find(r => r.path === 'specs/multi-fence.md');
    assert(multi.content.includes('This is the first fenced markdown block') || multi.content.includes('echo hello') , 'should capture first fenced content block');
    assert(pathsExtra.includes('specs/paragraph-fallback.md'), 'should include paragraph fallback');
      try { rmrf(specsDir); } catch (e) { /* best-effort cleanup */ }
    }

    console.log('All tests passed');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();


