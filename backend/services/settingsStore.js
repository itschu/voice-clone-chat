/**
 * Settings Store Service
 * Handles persistent storage for application settings and OpenRouter models
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');

// Directory initialization
const DATA_DIR = path.join(__dirname, '../../data');
const MODELS_PATH = path.join(DATA_DIR, 'openrouter-models.json');

// Bootstrap data directory
try {
	fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (error) {
	console.error('❌ Failed to create data directory:', error.message);
}

// Default settings
const DEFAULT_SETTINGS = { defaultLanguage: 'en', preferredLlmModel: null, apiKeys: {} };

/**
 * Get settings from database
 * @returns {Promise<Object>}
 */
async function getSettings() {
	try {
		const row = await db.queryOne('SELECT * FROM settings WHERE id = 1');
		if (!row) {
			// Should not happen due to init(), but fallback
			return { ...DEFAULT_SETTINGS };
		}

		let apiKeys;
		if (typeof row.api_keys === 'string') {
			apiKeys = JSON.parse(row.api_keys);
		} else {
			apiKeys = row.api_keys;
		}

		return {
			defaultLanguage: row.default_language ?? DEFAULT_SETTINGS.defaultLanguage,
			preferredLlmModel: row.preferred_llm_model ?? DEFAULT_SETTINGS.preferredLlmModel,
			apiKeys: apiKeys ?? DEFAULT_SETTINGS.apiKeys,
		};
	} catch (error) {
		console.error('❌ Failed to get settings:', error.message);
		throw error;
	}
}

/**
 * Save settings patch to database
 * @param {Object} patch - Partial settings to merge
 * @returns {Promise}
 */
async function saveSettings(patch) {
	try {
		const current = await getSettings();
		const merged = { ...current, ...patch };
		if (patch.apiKeys) {
			merged.apiKeys = Object.assign({}, current.apiKeys, patch.apiKeys);
		}

		const apiKeysJson = JSON.stringify(merged.apiKeys);
		const params = [merged.defaultLanguage, merged.preferredLlmModel, apiKeysJson];

		const sql = db.IS_POSTGRES ? 'UPDATE settings SET default_language = $1, preferred_llm_model = $2, api_keys = $3 WHERE id = 1' : 'UPDATE settings SET default_language = ?, preferred_llm_model = ?, api_keys = ? WHERE id = 1';

		await db.run(sql, params);
		console.log('✅ Settings saved');
	} catch (error) {
		console.error('❌ Failed to save settings:', error.message);
		throw error;
	}
}

/**
 * Get settings with API keys masked for display
 * @returns {Promise<Object>}
 */
async function getMaskedSettings() {
	const settings = await getSettings();
	const masked = { ...settings };
	masked.apiKeys = {};
	for (const [key, value] of Object.entries(settings.apiKeys)) {
		if (typeof value === 'string' && value.length > 0) {
			masked.apiKeys[key] = '••••••••' + value.slice(-4);
		} else {
			masked.apiKeys[key] = '';
		}
	}
	return masked;
}

/**
 * Get a staged API key by name
 * @param {string} name - API key name
 * @returns {Promise<string|null>}
 */
async function getStagedApiKey(name) {
	const settings = await getSettings();
	return settings.apiKeys[name] ?? null;
}

/**
 * Get OpenRouter models from disk
 * @returns {Promise<Array>}
 */
async function getOpenRouterModels() {
	try {
		const data = fs.readFileSync(MODELS_PATH, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new Error('openrouter-models.json not found');
		} else {
			throw error;
		}
	}
}

module.exports = {
	getSettings,
	saveSettings,
	getMaskedSettings,
	getStagedApiKey,
	getOpenRouterModels,
};
