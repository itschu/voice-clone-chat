// Settings page module for VoiceRA SPA
// Manages user settings: language, preferred LLM, API keys

// Module-level state
let settingsData = null;
let openrouterModels = [];

// Initialize the settings page
function init() {
	const container = document.getElementById('view-settings');
	container.innerHTML = `
		<div class="settings-page">
			<div class="nav-links">
				<a href="#/voices" class="nav-link">Manage Voices</a>
				<a href="#/chat" class="nav-link">Chat</a>
				<a href="#/settings" class="nav-link active">Settings</a>
			</div>
			<div class="settings-section">
				<div class="section-header">
					<div class="section-title">Language</div>
				</div>
				<div class="section-note">Default language for voice generation.</div>
				<select id="language-select">
					<option value="en">English</option>
					<option value="es">Spanish</option>
					<option value="fr">French</option>
					<option value="de">German</option>
					<option value="it">Italian</option>
					<option value="pt">Portuguese</option>
					<option value="ru">Russian</option>
					<option value="ja">Japanese</option>
					<option value="ko">Korean</option>
					<option value="zh">Chinese</option>
				</select>
				<div class="save-bar">
					<button id="language-save">Save</button>
				</div>
			</div>
			<div class="settings-section" id="llm-settings-section">
				<div class="section-header">
					<div class="section-title">Preferred LLM</div>
					<div id="openrouter-status" class="badge badge-inactive">OpenRouter Inactive</div>
					<div id="pending-restart" class="badge badge-warning hidden">Pending Restart</div>
				</div>
				<div class="section-note">Select your preferred language model for conversations.</div>
				<select id="llm-select" disabled>
					<option value="">Loading models...</option>
				</select>
				<div class="save-bar">
					<button id="llm-save">Save</button>
				</div>
			</div>
			<div class="settings-section">
				<div class="section-header">
					<div class="section-title">API Keys</div>
				</div>
				<div class="section-note">Configure API keys for voice services. Changes require server restart.</div>
				<div class="key-row">
					<label>ElevenLabs API Key</label>
					<input type="password" id="elevenlabs-key" placeholder="Enter your ElevenLabs API key">
					<button id="elevenlabs-test">Test</button>
					<span id="elevenlabs-result" class="key-result"></span>
				</div>
				<div class="key-row">
					<label>OpenRouter API Key</label>
					<input type="password" id="openrouter-key" placeholder="Enter your OpenRouter API key">
					<button id="openrouter-test">Test</button>
					<span id="openrouter-result" class="key-result"></span>
				</div>
				<details class="advanced-keys">
					<summary>Advanced provider keys</summary>
					<div class="key-row">
						<label>OpenAI API Key</label>
						<input type="password" id="openai-key" placeholder="Enter your OpenAI API key">
						<button id="openai-test">Test</button>
						<span id="openai-result" class="key-result"></span>
					</div>
					<div class="key-row">
						<label>Grok API Key</label>
						<input type="password" id="grok-key" placeholder="Enter your Grok API key">
						<button id="grok-test">Test</button>
						<span id="grok-result" class="key-result"></span>
					</div>
					<div class="key-row">
						<label>Gemini API Key</label>
						<input type="password" id="gemini-key" placeholder="Enter your Gemini API key">
						<button id="gemini-test">Test</button>
						<span id="gemini-result" class="key-result"></span>
					</div>
					<div class="key-row">
						<label>Ollama API Key</label>
						<input type="password" id="ollama-key" placeholder="Enter your Ollama API key">
						<button id="ollama-test">Test</button>
						<span id="ollama-result" class="key-result"></span>
					</div>
				</details>
				<div class="save-bar">
					<button id="keys-save">Save</button>
				</div>
			</div>
		</div>
		<div id="settings-toast" class="toast hidden"></div>
	`;

	loadSettings();

	// Wire up event listeners
	document.getElementById('language-save').addEventListener('click', saveLanguage);
	document.getElementById('keys-save').addEventListener('click', saveKeys);

	// LLM save button only exists when OpenRouter is active
	const llmSaveBtn = document.getElementById('llm-save');
	if (llmSaveBtn) {
		llmSaveBtn.addEventListener('click', saveLlm);
	}

	document.getElementById('elevenlabs-test').addEventListener('click', () => handleTestKey('elevenlabs', 'elevenlabs-key', 'elevenlabs-result'));
	document.getElementById('openrouter-test').addEventListener('click', () => handleTestKey('openrouter', 'openrouter-key', 'openrouter-result'));
	document.getElementById('openai-test').addEventListener('click', () => handleTestKey('openai', 'openai-key', 'openai-result'));
	document.getElementById('grok-test').addEventListener('click', () => handleTestKey('grok', 'grok-key', 'grok-result'));
	document.getElementById('gemini-test').addEventListener('click', () => handleTestKey('gemini', 'gemini-key', 'gemini-result'));
	document.getElementById('ollama-test').addEventListener('click', () => handleTestKey('ollama', 'ollama-key', 'ollama-result'));
}

// Load settings data
async function loadSettings() {
	await Promise.all([fetchSettings(), fetchModels()]);
	populateLlmSelect();
}

// Fetch settings from API
async function fetchSettings() {
	try {
		const response = await fetch('/api/settings');
		if (!response.ok) throw new Error('Failed to fetch settings');
		settingsData = await response.json();

		// Populate language
		document.getElementById('language-select').value = settingsData.settings.defaultLanguage;

		// Update OpenRouter status
		const statusEl = document.getElementById('openrouter-status');
		if (settingsData.openrouterActive) {
			statusEl.textContent = 'OpenRouter Active';
			statusEl.className = 'badge badge-active';
		} else {
			statusEl.textContent = 'OpenRouter Inactive';
			statusEl.className = 'badge badge-inactive';
		}

		// Show/hide pending restart badge
		const restartEl = document.getElementById('pending-restart');
		if (settingsData.pendingRestart?.valid) {
			restartEl.classList.remove('hidden');
		} else {
			restartEl.classList.add('hidden');
		}

		// Show/hide LLM section - remove from DOM if OpenRouter not active
		const llmSection = document.getElementById('llm-settings-section');
		if (!settingsData.openrouterActive) {
			llmSection.remove();
		}

		// Populate API keys (masked)
		document.getElementById('elevenlabs-key').value = settingsData.settings.apiKeys.elevenLabsApiKey || '';
		document.getElementById('openrouter-key').value = settingsData.settings.apiKeys.openRouterApiKey || '';
		document.getElementById('openai-key').value = settingsData.settings.apiKeys.openAiApiKey || '';
		document.getElementById('grok-key').value = settingsData.settings.apiKeys.grokApiKey || '';
		document.getElementById('gemini-key').value = settingsData.settings.apiKeys.geminiApiKey || '';
		document.getElementById('ollama-key').value = settingsData.settings.apiKeys.ollamaApiKey || '';
	} catch (error) {
		console.error('Error fetching settings:', error);
		showToast('Failed to load settings');
	}
}

// Fetch OpenRouter models
async function fetchModels() {
	try {
		const response = await fetch('/api/settings/openrouter-models');
		if (!response.ok) throw new Error('Failed to fetch models');
		openrouterModels = await response.json();

		const select = document.getElementById('llm-select');
		// Skip if LLM section was removed (OpenRouter not active)
		if (!select) return;

		select.innerHTML = '<option value="">Select a model...</option>';
		openrouterModels.forEach((model) => {
			const option = document.createElement('option');
			option.value = model.id;
			option.textContent = model.name;
			select.appendChild(option);
		});

		select.disabled = false;
	} catch (error) {
		console.error('Error fetching models:', error);
		showToast('Failed to load models');
	}
}

// Populate LLM select with saved model
function populateLlmSelect() {
	const select = document.getElementById('llm-select');
	// Skip if LLM section was removed (OpenRouter not active)
	if (!select) return;
	if (settingsData?.settings?.preferredLlmModel) {
		select.value = settingsData.settings.preferredLlmModel;
	}
}

// Save language setting
async function saveLanguage() {
	const value = document.getElementById('language-select').value;
	try {
		const response = await fetch('/api/settings', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ defaultLanguage: value }),
		});
		if (!response.ok) throw new Error('Failed to save language');
		showToast('Settings saved.');
	} catch (error) {
		console.error('Error saving language:', error);
		showToast('Failed to save language');
	}
}

// Save LLM setting
async function saveLlm() {
	const value = document.getElementById('llm-select').value;
	try {
		const response = await fetch('/api/settings', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ preferredLlmModel: value }),
		});
		if (!response.ok) throw new Error('Failed to save LLM');
		showToast('Settings saved.');
	} catch (error) {
		console.error('Error saving LLM:', error);
		showToast('Failed to save LLM');
	}
}

// Handle test key
async function handleTestKey(provider, inputId, resultId) {
	const input = document.getElementById(inputId);
	if (!input) {
		console.error(`Input element ${inputId} not found`);
		return;
	}
	const value = input.value;
	const resultSpan = document.getElementById(resultId);

	if (!value || value.startsWith('••')) {
		resultSpan.textContent = '❌ Enter a key first';
		return;
	}

	resultSpan.textContent = 'Testing…';

	try {
		const response = await fetch('/api/settings/test-key', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ provider, key: value }),
		});
		if (!response.ok) throw new Error('Test failed');
		const result = await response.json();
		resultSpan.textContent = result.valid ? '✅ Key valid' : '❌ Invalid key';
	} catch (error) {
		console.error('Error testing key:', error);
		resultSpan.textContent = '❌ Test failed';
	}
}

// Save API keys
async function saveKeys() {
	const apiKeys = {};
	const keyMappings = {
		'elevenlabs-key': 'elevenLabsApiKey',
		'openrouter-key': 'openRouterApiKey',
		'openai-key': 'openAiApiKey',
		'grok-key': 'grokApiKey',
		'gemini-key': 'geminiApiKey',
		'ollama-key': 'ollamaApiKey',
	};

	Object.keys(keyMappings).forEach((id) => {
		const input = document.getElementById(id);
		const value = input.value;
		if (value && !value.startsWith('••')) {
			apiKeys[keyMappings[id]] = value;
		}
	});

	try {
		const response = await fetch('/api/settings', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ apiKeys }),
		});
		if (!response.ok) throw new Error('Failed to save keys');
		showToast('Settings saved.');
		await fetchSettings(); // Refresh masked values and pending restart badge
	} catch (error) {
		console.error('Error saving keys:', error);
		showToast('Failed to save keys');
	}
}

// Show toast notification
function showToast(message) {
	const toast = document.getElementById('settings-toast');
	toast.textContent = message;
	toast.classList.remove('hidden');
	setTimeout(() => {
		toast.classList.add('hidden');
	}, 4000);
}

// Expose globally
window.settingsPage = { init };
