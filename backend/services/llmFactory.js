/**
 * LLM provider factory module
 * Dynamically loads and delegates to the configured LLM provider
 */

// Provider registry mapping provider names to their relative module paths
const PROVIDER_REGISTRY = {
	openai: './llm/openai',
	grok: './llm/grok',
	gemini: './llm/gemini',
	ollama: './llm/ollama',
	openrouter: './llm/openrouter',
};

// Read provider from environment at module load time
const providerName = process.env.LLM_PROVIDER || 'openai';

// Validate provider name
if (!PROVIDER_REGISTRY.hasOwnProperty(providerName)) {
	throw new Error(`❌ Unknown LLM_PROVIDER '${providerName}'. Allowed values: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`);
}

// Lazily require only the active provider module
const provider = require(PROVIDER_REGISTRY[providerName]);

// Load OpenRouter status for dynamic dispatch
const openrouterStatus = require('./openrouterStatus');

// Cache for lazily loaded OpenRouter adapter
let openrouterAdapter = null;

/**
 * Checks if the configured LLM provider has all required environment variables set
 * @returns {boolean} True if the provider is properly configured
 */
function isConfigured() {
	return provider.isConfigured();
}

/**
 * Sends messages to the configured LLM provider and returns the response
 * @param {Array} messages - Array of message objects with role and content
 * @param {Object} options - Optional parameters (e.g., modelOverride)
 * @returns {Promise<string>} The response text from the LLM
 */
async function chat(messages, options = {}) {
	try {
		const { modelOverride } = options;

		if (!modelOverride) {
			// No model override: use baseline provider
			return await provider.chat(messages);
		}

		// Model override requested: check OpenRouter status
		if (!openrouterStatus.isActive()) {
			console.warn('⚠️ Model override requested but OpenRouter is inactive, falling back to baseline provider');
			return await provider.chat(messages);
		}

		// OpenRouter active: route to OpenRouter with model override
		if (!openrouterAdapter) {
			openrouterAdapter = providerName === 'openrouter' ? provider : require('./llm/openrouter');
		}
		return await openrouterAdapter.chat(messages, { modelOverride });
	} catch (error) {
		// Re-throw as-is since providers already produce descriptive messages
		throw error;
	}
}

module.exports = { isConfigured, chat };
