/**
 * OpenAI LLM Service
 * Handles chat completions using OpenAI's API
 */

const OpenAI = require('openai');

// OpenAI Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Validate configuration
if (!OPENAI_API_KEY) {
	console.warn('⚠️  OpenAI API key not configured. Set OPENAI_API_KEY in .env');
}

// OpenAI client instance
const client = new OpenAI({
	apiKey: OPENAI_API_KEY,
});

/**
 * Check if OpenAI is properly configured
 * @returns {boolean}
 */
function isConfigured() {
	return !!OPENAI_API_KEY;
}

/**
 * Chat with OpenAI
 * @param {Array<{role: string, content: string}>} messages - Array of messages
 * @returns {Promise<string>} - Response content
 */
async function chat(messages) {
	if (!isConfigured()) {
		throw new Error('OpenAI API key not configured');
	}

	try {
		console.log('🤖 Sending request to OpenAI...');

		const response = await client.chat.completions.create({
			model: process.env.OPENAI_MODEL || 'gpt-4o',
			messages: messages,
		});

		const content = response.choices[0].message.content;
		console.log('✅ OpenAI response received');

		return content;
	} catch (error) {
		console.error('❌ OpenAI chat failed:', error.message);

		if (error.status === 401) {
			throw new Error('❌ OpenAI: Invalid API key');
		} else if (error.status === 429) {
			throw new Error('❌ OpenAI: Rate limit exceeded');
		} else {
			throw new Error(`❌ OpenAI chat failed: ${error.message}`);
		}
	}
}

module.exports = {
	isConfigured,
	chat,
};