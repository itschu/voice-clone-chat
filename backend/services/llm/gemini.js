/**
 * Gemini LLM Service
 * Handles chat completions using Google's Gemini API
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Gemini Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Validate configuration
if (!GEMINI_API_KEY) {
	console.warn('⚠️  Gemini API key not configured. Set GEMINI_API_KEY in .env');
}

/**
 * Check if Gemini is properly configured
 * @returns {boolean}
 */
function isConfigured() {
	return !!GEMINI_API_KEY;
}

/**
 * Chat with Gemini
 * @param {Array<{role: string, content: string}>} messages - Array of messages
 * @returns {Promise<string>} - Response content
 */
async function chat(messages) {
	if (!isConfigured()) {
		throw new Error('Gemini API key not configured');
	}

	try {
		console.log('🤖 Sending request to Gemini...');

		// Find system message and prepare history
		let systemInstruction = '';
		const filteredMessages = [];

		for (const message of messages) {
			if (message.role === 'system') {
				systemInstruction = message.content;
			} else {
				filteredMessages.push(message);
			}
		}

		// Convert messages to Gemini format
		const history = [];
		let lastMessage = null;

		for (let i = 0; i < filteredMessages.length; i++) {
			const message = filteredMessages[i];
			const geminiMessage = {
				role: message.role === 'assistant' ? 'model' : 'user',
				parts: [{ text: message.content }],
			};

			if (i === filteredMessages.length - 1) {
				lastMessage = geminiMessage.parts;
			} else {
				history.push(geminiMessage);
			}
		}

		// Check if filteredMessages is empty (only system messages provided)
		if (filteredMessages.length === 0) {
			console.log('No non-system messages provided to Gemini.');
			return '';
		}

		// Initialize Gemini client
		const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
		const model = genAI.getGenerativeModel({
			model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
			systemInstruction: systemInstruction,
		});

		// Start chat and send message
		const chatInstance = model.startChat({
			history: history,
		});

		const result = await chatInstance.sendMessage(lastMessage);
		const response = await result.response;
		const content = response.text();

		console.log('✅ Gemini response received');

		return content;
	} catch (error) {
		console.error('❌ Gemini chat failed:', error.message);
		throw new Error(`❌ Gemini chat failed: ${error.message}`);
	}
}

module.exports = {
	isConfigured,
	chat,
};