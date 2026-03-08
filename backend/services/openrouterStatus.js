/**
 * OpenRouter Status Service
 * Manages OpenRouter API key validation and runtime status
 */

const axios = require('axios');

let active = false;
let pendingRestart = null;
let validating = false;

/**
 * Private helper to call OpenRouter models endpoint
 * @param {string} key - API key to test
 * @returns {Promise<boolean>}
 */
async function callModelsEndpoint(key) {
	try {
		const response = await axios.get('https://openrouter.ai/api/v1/models', {
			headers: { Authorization: 'Bearer ' + key },
			timeout: 10000,
		});
		return response.status >= 200 && response.status < 300;
	} catch (error) {
		return false;
	}
}

/**
 * Validate runtime OpenRouter key from environment
 * @returns {Promise<void>}
 */
async function validateRuntime() {
	try {
		const key = process.env.OPENROUTER_API_KEY;
		if (!key || key.trim() === '') {
			active = false;
			console.log('⚠️ OpenRouter inactive');
			return;
		}
		const valid = await callModelsEndpoint(key);
		active = valid;
		if (valid) {
			console.log('✅ OpenRouter active');
		} else {
			console.log('⚠️ OpenRouter inactive');
		}
	} catch (error) {
		active = false;
		console.warn('⚠️ OpenRouter validation error:', error.message);
	}
}

/**
 * Validate a staged API key for pending restart
 * @param {string} key - API key to validate
 * @returns {Promise<Object>}
 */
async function validateStagedKey(key) {
	validating = true;
	try {
		const valid = await callModelsEndpoint(key);
		pendingRestart = { valid, testedAt: new Date().toISOString() };
	} catch (error) {
		pendingRestart = { valid: false, testedAt: new Date().toISOString() };
	} finally {
		validating = false;
	}
	return pendingRestart;
}

/**
 * Check if OpenRouter is currently active
 * @returns {boolean}
 */
function isActive() {
	return active;
}

/**
 * Check if validation is currently in progress
 * @returns {boolean}
 */
function isValidating() {
	return validating;
}

/**
 * Get pending restart status
 * @returns {Object|null}
 */
function getPendingRestartStatus() {
	return pendingRestart;
}

module.exports = {
	validateRuntime,
	validateStagedKey,
	isActive,
	isValidating,
	getPendingRestartStatus,
};
