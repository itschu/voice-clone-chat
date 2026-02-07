// services/f5tts.js
const Replicate = require('replicate');
const axios = require('axios');

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

const replicate = new Replicate({
	auth: REPLICATE_API_TOKEN,
});

function isConfigured() {
	return !!REPLICATE_API_TOKEN;
}

async function generateSpeech({ text, audioFiles }) {
	if (!isConfigured()) throw new Error('REPLICATE_API_TOKEN is missing');

	console.log(`🎙️ Sending to F5-TTS (Replicate)...`);

	// Model ID: F5-TTS (x-lance implementation)
	const model = 'x-lance/f5-tts:87faf6dd7a692dd82043f662e76369cab126a2cf1937e25a9d41e0b834fd230e';

	try {
		const output = await replicate.run(model, {
			input: {
				gen_text: text,
				ref_audio: audioFiles[0].buffer, // Replicate SDK handles buffer uploads automatically
				ref_text: '', // Optional
			},
		});

		console.log(`✅ F5-TTS URL: ${output}`);

		// Download audio from Replicate URL
		const response = await axios.get(output, { responseType: 'arraybuffer' });
		return Buffer.from(response.data);
	} catch (error) {
		console.error('❌ F5-TTS Error:', error);
		throw new Error(`F5-TTS Failed: ${error.message}`);
	}
}

module.exports = { isConfigured, generateSpeech };
