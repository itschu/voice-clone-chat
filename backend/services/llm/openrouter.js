// OpenRouter LLM Service — OpenAI-compatible gateway to 200+ models
const OpenAI = require('openai');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Build defaultHeaders conditionally
const defaultHeaders = {};
if (process.env.OPENROUTER_SITE_URL) {
  defaultHeaders['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
}
if (process.env.OPENROUTER_SITE_NAME) {
  defaultHeaders['X-Title'] = process.env.OPENROUTER_SITE_NAME;
}

// Initialize OpenAI client with OpenRouter settings
const client = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders
});

function isConfigured() {
  return !!process.env.OPENROUTER_API_KEY;
}

async function chat(messages) {
  if (!isConfigured()) {
    throw new Error('OpenRouter API key not configured');
  }

  try {
    console.log('🤖 Sending request to OpenRouter...');

    const response = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
      messages
    });

    console.log('✅ OpenRouter response received');
    return response.choices[0].message.content;
  } catch (error) {
    console.log(`❌ OpenRouter chat failed: ${error.message}`);

    if (error.status === 401) {
      throw new Error('❌ OpenRouter: Invalid API key');
    } else if (error.status === 429) {
      throw new Error('❌ OpenRouter: Rate limit exceeded');
    } else {
      throw new Error(`❌ OpenRouter chat failed: ${error.message}`);
    }
  }
}

module.exports = { isConfigured, chat };