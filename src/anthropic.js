const AbortController = globalThis.AbortController;

// Prefer official SDK if installed
let AnthropicSDK = null;
try {
  const mod = require('@anthropic-ai/sdk');
  AnthropicSDK = mod && (mod.default || mod);
} catch (e) {
  AnthropicSDK = null;
}

async function callAnthropic({ systemPrompt, userPrompt, model = 'claude-4-sonnet-20240620', temperature = 0.0, timeoutMs, maxRetries, baseDelayMs = 500 } = {}) {
  // allow overrides via env vars
  timeoutMs = timeoutMs || Number(process.env.ANTHROPIC_TIMEOUT_MS) || 15000;
  maxRetries = typeof maxRetries === 'number' ? maxRetries : (Number(process.env.ANTHROPIC_MAX_RETRIES) || 3);
  baseDelayMs = baseDelayMs || Number(process.env.ANTHROPIC_BASE_DELAY_MS) || 500;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is required');

  // If SDK is available, use it (it handles auth and request shapes)
  if (AnthropicSDK) {
    const client = new AnthropicSDK({ apiKey });
    // Build messages per SDK expectations
    const messages = [
      { role: 'system', content: [{ type: 'text', text: systemPrompt }] },
      { role: 'user', content: [{ type: 'text', text: userPrompt }] }
    ];
    try {
      const resp = await client.messages.create({ model, temperature, messages });
      // resp may have different shapes; extract text conservatively
      if (!resp) return '';
      if (resp.content) return typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
      if (resp.output && resp.output.text) return resp.output.text;
      if (resp.completion) return resp.completion;
      return JSON.stringify(resp);
    } catch (e) {
      // fall through to fetch-based path for retries/error handling
      // but if it's an auth error, rethrow
      if (e && e.status === 401) throw new Error('Anthropic API authentication error (401)');
    }
  }

  if (typeof fetch !== 'function') throw new Error('global fetch is not available in this environment');

  const url = 'https://api.anthropic.com/v1/complete';
  const payload = {
    model,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const status = res.status || 500;
        // Retry on server errors or rate limits
        if (status >= 500 || status === 429) {
          throw new RetryableError(`HTTP ${status}`);
        }
        const body = await safeJson(res);
        throw new Error(`Anthropic API error ${status}: ${JSON.stringify(body)}`);
      }

      const json = await safeJson(res);
      // robust extraction: check multiple possible shapes
      const text = json.completion || (json.output && json.output.text) ||
        (Array.isArray(json.completions) && json.completions[0] && (json.completions[0].text || json.completions[0].completion)) ||
        (json.choices && json.choices[0] && (json.choices[0].text || json.choices[0].message && json.choices[0].message.content)) ||
        (typeof json === 'string' ? json : null);
      return text !== null ? text : JSON.stringify(json);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        // treat as retryable
      }
      if (err instanceof RetryableError || err.name === 'AbortError' || attempt < maxRetries) {
        if (attempt >= maxRetries) throw err;
        const jitter = Math.floor(Math.random() * 100);
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

class RetryableError extends Error {}

async function safeJson(res) {
  try {
    return await res.json();
  } catch (e) {
    return { text: await res.text().catch(() => '') };
  }
}

module.exports = { callAnthropic };


