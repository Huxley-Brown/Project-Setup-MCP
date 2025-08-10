import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
// Note: intentionally avoid importing local modules here to prevent startup failures
// if env/config is missing. We lazy-load inside the tool handler.

const toolDef = {
  name: 'generate_project',
  description: 'Generate a project spec and return MCP create_file/edit_file proposals. Set allowWrite=true to write files.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      allowWrite: { type: 'boolean' }
    },
    required: ['prompt']
  }
};

const server = new Server(
  { name: 'spec-generator', version: '0.0.1' },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Explicitly respond to tools/list so clients can discover our tool
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.inputSchema
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params?.name !== toolDef.name) {
    throw new Error(`Unknown tool: ${req.params?.name}`);
  }
  const { prompt, allowWrite } = req.params.arguments || {};
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('prompt is required');
  }
  // Lazy-load to avoid breaking initialization when deps/env are missing
  const { generateProject } = await import('./orchestrator.js');
  // Default allowWrite from config if not explicitly provided
  const { config } = await import('./config.js');
  // Env is the default. Only override with request when explicitly true.
  const effectiveAllowWrite = allowWrite === true ? true : Boolean(config.allowWrite);
  const results = await generateProject(prompt, { allowWrite: effectiveAllowWrite });
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(results)
      }
    ]
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);

