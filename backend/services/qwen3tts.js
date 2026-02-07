// services/qwen3tts.js
const { Client } = require('@gradio/client');
const axios = require('axios');

const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE;

function isConfigured() {
	// Hugging Face token is optional for public spaces, but recommended for higher rate limits
	return true;
}

async function generateSpeech({ text, audioFiles }) {
	console.log(`🎙️ Sending to Qwen3-TTS (Hugging Face)...`);

	try {
		// Connect to the official Qwen3-TTS space
		// Token is optional for public spaces
		const clientOptions = HUGGING_FACE_TOKEN ? { hf_token: HUGGING_FACE_TOKEN } : {};
		const app = await Client.connect('Qwen/Qwen3-TTS', clientOptions);

		// The Qwen space expects for generate_voice_clone:
		// [ref_audio, ref_text, target_text, language, use_xvector_only, model_size]
		const prediction = await app.predict('/generate_voice_clone', [
			audioFiles[0].buffer, // ref_audio: Reference audio file
			'',                   // ref_text: Reference text (empty since use_xvector_only=true)
			text,                 // target_text: Text to generate
			'English',            // language: Language
			true,                 // use_xvector_only: Use x-vector only (no need for ref text)
			'1.7B',               // model_size: Model size (0.6B or 1.7B)
		]);

		console.log(`✅ Qwen3-TTS Speech Generated!`);

		// The output is [file_object, status_message]
		// file_object contains url to download the audio
		const fileObject = prediction.data[0];
		
		if (!fileObject || !fileObject.url) {
			throw new Error('Unexpected response format from Qwen3-TTS');
		}

		console.log(`📥 Downloading audio from: ${fileObject.url}`);
		
		// Download the audio file
		const response = await axios.get(fileObject.url, { 
			responseType: 'arraybuffer',
			timeout: 60000 // 60 second timeout
		});
		
		return Buffer.from(response.data);

	} catch (error) {
		console.error('❌ Qwen3-TTS Generation failed:', error);
		throw new Error(`Qwen3-TTS Failed: ${error.message}`);
	}
}

module.exports = { isConfigured, generateSpeech };
