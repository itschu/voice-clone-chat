/**
 * Grok LLM Service
 * Handles chat completions using xAI's Grok API
 */

const axios = require('axios');

// Grok Configuration
const GROK_API_KEY = process.env.GROK_API_KEY;

// Validate configuration
if (!GROK_API_KEY) {
	console.warn('⚠️  Grok API key not configured. Set GROK_API_KEY in .env');
}

/**
 * Check if Grok is properly configured
 * @returns {boolean}
 */
function isConfigured() {
	return !!GROK_API_KEY;
}

/**
 * Chat with Grok
 * @param {Array<{role: string, content: string}>} messages - Array of messages
 * @returns {Promise<string>} - Response content
 */
async function chat(messages) {
	if (!isConfigured()) {
		throw new Error('Grok API key not configured');
	}

	try {
		console.log('🤖 Sending request to Grok...');

		const response = await axios.post(
			'https://api.x.ai/v1/chat/completions',
			{
				model: process.env.GROK_MODEL || 'grok-3',
				messages: messages,
			},
			{
				headers: {
					Authorization: `Bearer ${GROK_API_KEY}`,
					'Content-Type': 'application/json',
				},
			}
		);

		const content = response.data.choices[0].message.content;
		console.log('✅ Grok response received');

		return content;
	} catch (error) {
		console.error('❌ Grok chat failed:', error.message);

		if (error.response) {
			const status = error.response.status;

			if (status === 401) {
				throw new Error('❌ Grok: Invalid API key');
			} else if (status === 429) {
				throw new Error('❌ Grok: Rate limit exceeded');
			} else {
				throw new Error(`❌ Grok chat failed: ${error.message}`);
			}
		} else {
			throw new Error(`❌ Grok chat failed: ${error.message}`);
		}
	}
}

module.exports = {
	isConfigured,
	chat,
};