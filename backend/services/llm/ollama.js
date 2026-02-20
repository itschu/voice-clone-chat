/**
 * Ollama LLM Service
 * Handles chat completions using Ollama's API
 */

const axios = require('axios');

// Ollama Configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;

// Validate configuration
if (!OLLAMA_BASE_URL || !OLLAMA_MODEL) {
	console.warn('⚠️  Ollama not fully configured. Set OLLAMA_BASE_URL and OLLAMA_MODEL in .env');
}

/**
 * Check if Ollama is properly configured
 * @returns {boolean}
 */
function isConfigured() {
	return !!(OLLAMA_BASE_URL && OLLAMA_MODEL);
}

/**
 * Chat with Ollama
 * @param {Array<{role: string, content: string}>} messages - Array of messages
 * @returns {Promise<string>} - Response content
 */
async function chat(messages) {
	if (!isConfigured()) {
		throw new Error('Ollama not fully configured. Set OLLAMA_BASE_URL and OLLAMA_MODEL in .env');
	}

	try {
		console.log('🤖 Sending request to Ollama...');

		const response = await axios.post(
			`${OLLAMA_BASE_URL}/api/chat`,
			{
				model: OLLAMA_MODEL,
				messages: messages,
				stream: false,
			}
		);

		const content = response.data.message.content;
		console.log('✅ Ollama response received');

		return content;
	} catch (error) {
		console.error('❌ Ollama chat failed:', error.message);
		throw new Error(`❌ Ollama chat failed: ${error.message}`);
	}
}

module.exports = {
	isConfigured,
	chat,
};