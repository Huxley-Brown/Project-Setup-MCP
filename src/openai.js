const OpenAI = require('openai');

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5-2025-08-07';

async function callOpenAI({ systemPrompt, userPrompt, model = DEFAULT_MODEL, temperature = 0, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is required');

  const client = new OpenAI({ apiKey });

  // Prefer the Responses API if available; otherwise fall back to chat.completions
  if (client.responses && client.responses.create) {
    const payload = {
      model,
      max_output_tokens: maxTokens || Number(process.env.OPENAI_MAX_TOKENS || 20000),
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
    // Some models (e.g., GPT-5) may not support temperature; include only if explicitly set
    const t = process.env.OPENAI_TEMPERATURE;
    if (t !== undefined) payload.temperature = Number(t);
    const resp = await client.responses.create(payload);
    const text = extractText(resp);
    return text;
  }

  const payload = {
    model,
    max_tokens: maxTokens || Number(process.env.OPENAI_MAX_TOKENS || 20000),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };
  const t2 = process.env.OPENAI_TEMPERATURE;
  if (t2 !== undefined) payload.temperature = Number(t2);
  const resp = await client.chat.completions.create(payload);
  const text = resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
  return Array.isArray(text) ? text.map(t => t.text || t).join('\n') : text;
}

function extractText(resp) {
  if (!resp) return '';
  if (resp.output_text) return resp.output_text;
  if (Array.isArray(resp.output)) {
    return resp.output.map(part => (part.type === 'output_text' && part.text) ? part.text : '').join('\n');
  }
  return JSON.stringify(resp);
}

module.exports = { callOpenAI };


