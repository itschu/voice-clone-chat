// services/qwen.js
const axios = require('axios');
const { uploadToPublicUrl } = require('./tempUpload');

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

function isConfigured() {
	return !!DASHSCOPE_API_KEY;
}

async function generateSpeech({ sessionId, text, audioFiles }) {
	if (!isConfigured()) throw new Error('DASHSCOPE_API_KEY is missing');

	// 1. Get Public URL for the first reference audio
	const refFile = audioFiles[0];
	console.log(`📤 Uploading "${refFile.filename}" to temporary host for Qwen...`);
	const publicAudioUrl = await uploadToPublicUrl(refFile.buffer, refFile.filename);

	console.log(`🎙️ Sending to Qwen (CosyVoice)...`);

	// 2. Call DashScope API
	// Documentation: https://help.aliyun.com/document_detail/2712522.html
	const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-to-speech/voice-cloning';

	const payload = {
		model: 'cosyvoice-v1',
		input: {
			text: text,
		},
		parameters: {
			text_type: 'PlainText',
			reference_audio_url: publicAudioUrl,
		},
	};

	try {
		const response = await axios.post(url, payload, {
			headers: {
				Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
				'Content-Type': 'application/json',
				'X-DashScope-Async': 'enable', // Force async if needed, but standard is sync for short text
			},
			responseType: 'json', // DashScope usually returns a URL or Task ID
		});

		// Handle Async vs Sync response
		// For this MVP, we assume the synchronous endpoint or simple URL return.
		// NOTE: If DashScope returns a "task_id", we would need polling.
		// Most voice cloning endpoints return a direct audio URL in the output.

		if (response.data.output && response.data.output.audio_url) {
			const audioUrl = response.data.output.audio_url;
			console.log(`✅ Qwen generation successful: ${audioUrl}`);

			// Download the result back to buffer
			const audioResp = await axios.get(audioUrl, { responseType: 'arraybuffer' });
			return Buffer.from(audioResp.data);
		} else if (response.data.code) {
			throw new Error(`DashScope Error ${response.data.code}: ${response.data.message}`);
		} else {
			throw new Error('Unexpected response format from Qwen');
		}
	} catch (error) {
		console.error('❌ Qwen API Error:', error.response?.data || error.message);
		throw new Error(`Qwen Generation Failed: ${error.message}`);
	}
}

module.exports = { isConfigured, generateSpeech };
