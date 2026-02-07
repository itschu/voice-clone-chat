// services/voiceFactory.js
const elevenlabs = require('./elevenlabs');
const f5tts = require('./f5tts');
const qwen = require('./qwen');
const qwen3tts = require('./qwen3tts');

// Load default from ENV, default to elevenlabs
const SELECTED_SERVICE = process.env.VOICE_SERVICE || 'elevenlabs';

console.log(`🎛️  Active Voice Service: ${SELECTED_SERVICE.toUpperCase()}`);

const services = {
	elevenlabs,
	f5tts,
	qwen,
	qwen3tts,
};

function getCurrentService() {
	const service = services[SELECTED_SERVICE.toLowerCase()];
	if (!service) {
		throw new Error(`Invalid VOICE_SERVICE in .env: ${SELECTED_SERVICE}`);
	}
	return service;
}

async function generate(sessionId, text, audioFiles) {
	const service = getCurrentService();

	if (!service.isConfigured()) {
		throw new Error(`Service provider '${SELECTED_SERVICE}' is not configured (missing API key)`);
	}

	let audioBuffer;
	let voiceId = `${SELECTED_SERVICE}_${sessionId}`;

	// Handle ElevenLabs specific flow (Clone -> Generate)
	if (SELECTED_SERVICE === 'elevenlabs') {
		const name = `voicera_${sessionId}`;
		voiceId = await service.createVoiceClone(name, audioFiles);
		audioBuffer = await service.generateSpeech(voiceId, text);
	}
	// Handle One-Shot providers (F5 / Qwen)
	else {
		audioBuffer = await service.generateSpeech({
			sessionId,
			text,
			audioFiles,
		});
	}

	return { audioBuffer, voiceId };
}

module.exports = {
	generate,
	isConfigured: () => getCurrentService().isConfigured(),
};
