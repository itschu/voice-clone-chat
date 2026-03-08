/**
 * Settings Routes
 * API endpoints for application settings management
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const settingsStore = require('../services/settingsStore');
const openrouterStatus = require('../services/openrouterStatus');

// GET /api/settings
router.get('/', async (req, res) => {
	try {
		const settings = await settingsStore.getMaskedSettings();
		const openrouterActive = openrouterStatus.isActive();
		const pendingRestart = openrouterStatus.getPendingRestartStatus();
		res.json({ settings, openrouterActive, pendingRestart });
	} catch (error) {
		console.error('❌ Settings GET error:', error.message);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// PUT /api/settings
router.put('/', async (req, res) => {
	try {
		const body = { ...req.body };

		// Filter API keys: remove empty strings and masked placeholders
		if (body.apiKeys) {
			const filteredApiKeys = {};
			for (const [key, value] of Object.entries(body.apiKeys)) {
				if (typeof value === 'string') {
					const trimmed = value.trim();
					if (trimmed !== '' && !trimmed.startsWith('••')) {
						filteredApiKeys[key] = trimmed;
					}
				}
				// ignore non-string values
			}
			body.apiKeys = filteredApiKeys;
		}

		// Validate staged OpenRouter key if present
		if (body.apiKeys && body.apiKeys.openRouterApiKey) {
			await openrouterStatus.validateStagedKey(body.apiKeys.openRouterApiKey);
		}

		// Save settings
		await settingsStore.saveSettings(body);

		const pendingRestart = openrouterStatus.getPendingRestartStatus();
		res.json({ success: true, pendingRestart });
	} catch (error) {
		console.error('❌ Settings PUT error:', error.message);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// GET /api/settings/openrouter-models
router.get('/openrouter-models', async (req, res) => {
	try {
		const models = await settingsStore.getOpenRouterModels();
		res.json(models);
	} catch (error) {
		console.error('❌ OpenRouter models error:', error.message);
		if (error.message.includes('not found')) {
			res.status(500).json({ error: error.message });
		} else {
			res.status(500).json({ error: 'Internal server error' });
		}
	}
});

// POST /api/settings/test-key
router.post('/test-key', async (req, res) => {
	const { provider, key } = req.body;

	if (!key || key.trim() === '') {
		return res.json({ valid: false });
	}

	const trimmedKey = key.trim();

	const providerConfigs = {
		openrouter: {
			url: 'https://openrouter.ai/api/v1/models',
			headers: { Authorization: 'Bearer ' + trimmedKey },
		},
		openai: {
			url: 'https://api.openai.com/v1/models',
			headers: { Authorization: 'Bearer ' + trimmedKey },
		},
		elevenlabs: {
			url: 'https://api.elevenlabs.io/v1/user',
			headers: { 'xi-api-key': trimmedKey },
		},
		grok: {
			url: 'https://api.x.ai/v1/models',
			headers: { Authorization: 'Bearer ' + trimmedKey },
		},
		gemini: {
			url: `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`,
			headers: {},
		},
	};

	if (!providerConfigs[provider]) {
		return res.json({ valid: false });
	}

	try {
		const config = providerConfigs[provider];
		const response = await axios.get(config.url, { headers: config.headers, timeout: 10000 });
		res.json({ valid: response.status >= 200 && response.status < 300 });
	} catch (error) {
		res.json({ valid: false });
	}
});

module.exports = router;
