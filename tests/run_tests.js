require('dotenv').config();
const fs = require('fs');
const assert = require('assert');
const path = require('path');
const { buildCreateCall, createFile } = require('../src/repomix');
const { callAnthropic } = require('../src/anthropic');

function mustExist(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p}`);
  console.log(`OK  - ${p}`);
}

function readFixture(name) {
  const p = path.join(__dirname, 'fixtures', name);
  return fs.readFileSync(p, 'utf8');
}

(async function run() {
  try {
    const root = path.resolve(__dirname, '..');
    // Presence checks
    mustExist(path.join(root, 'tests/fixtures/anthropic_good.md'));
    mustExist(path.join(root, 'tests/fixtures/anthropic_malformed.md'));
    mustExist(path.join(root, 'system-prompt.md'));
    mustExist(path.join(root, 'src/anthropic.js'));
    mustExist(path.join(root, 'src/repomix.js'));
    mustExist(path.join(root, 'src/config.js'));

    // repomix wrapper shape
    const sampleCall = buildCreateCall('specs/overview.md', '# hi');
    assert(sampleCall && sampleCall.name === 'create_file', 'repomix create must be named create_file');
    assert(sampleCall.arguments && sampleCall.arguments.path === 'specs/overview.md', 'repomix create path');

    // repomix dry-run createFile
    const dry = createFile('specs/dry-run.md', 'hello');
    assert(dry && dry.name === 'create_file', 'createFile dry-run should return create_file call');

    // repomix write-mode createFile
    const writePath = path.join('tests', 'tmp', 'write_test.md');
    const writeContent = 'written-content';
    const res = createFile(writePath, writeContent, { allowWrite: true });
    assert(res && res.ok, 'createFile should return ok when writing');
    const absWritten = path.join(process.cwd(), writePath);
    assert(fs.existsSync(absWritten), 'written file should exist');
    const got = fs.readFileSync(absWritten, 'utf8');
    assert.strictEqual(got, writeContent, 'written file content should match');
    try { fs.unlinkSync(absWritten); } catch (e) {}

    // Anthropic client: missing API key path
    const origApiKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    let threw = false;
    try {
      await callAnthropic({ systemPrompt: 's', userPrompt: 'u', timeoutMs: 500, maxRetries: 1 });
    } catch (e) {
      threw = true;
      assert(/ANTHROPIC_API_KEY/.test(e.message), 'should complain about missing API key');
    }
    assert(threw, 'callAnthropic should throw when API key missing');
    if (origApiKey) process.env.ANTHROPIC_API_KEY = origApiKey;

    // Anthropic client: success with mocked fetch
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({ completion: 'hello-from-api' }) });
    const resp = await callAnthropic({ systemPrompt: 's', userPrompt: 'u', timeoutMs: 1000, maxRetries: 1 });
    assert.strictEqual(resp, 'hello-from-api', 'should return completion text from mock');
    global.fetch = origFetch;
    if (origApiKey) process.env.ANTHROPIC_API_KEY = origApiKey; else delete process.env.ANTHROPIC_API_KEY;

    console.log('All tests passed');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();


