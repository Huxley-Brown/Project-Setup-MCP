#!/usr/bin/env node
const { generateProject } = require('./orchestrator');
const { config } = require('./config');

function parseArgs(argv) {
  const args = { allowWrite: config.allowWrite };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--allow-write') args.allowWrite = true;
    else if (a === '--no-write') args.allowWrite = false;
    else if (!args.prompt) args.prompt = a;
  }
  return args;
}

async function main() {
  const { prompt, allowWrite } = parseArgs(process.argv.slice(2));
  if (!prompt) {
    console.error('Usage: node src/cli.js "<project description>" [--allow-write]');
    process.exit(2);
  }
  const results = await generateProject(prompt, { allowWrite });
  console.log(JSON.stringify(results, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Error:', e.message || e);
    process.exit(1);
  });
}


