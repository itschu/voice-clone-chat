// services/transcription.js
const axios = require('axios');
const Replicate = require('replicate');

const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

const replicate = REPLICATE_API_TOKEN ? new Replicate({ auth: REPLICATE_API_TOKEN }) : null;

/**
 * Transcribe audio using Hugging Face (free) or Replicate (fallback)
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} filename - Original filename
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudio(audioBuffer, filename) {
	console.log(`🎤 Transcribing audio: ${filename} (${audioBuffer.length} bytes)`);

	// Try Hugging Face first (free), then fall back to Replicate
	try {
		return await transcribeWithHuggingFace(audioBuffer);
	} catch (hfError) {
		console.log(`⚠️ Hugging Face failed: ${hfError.message}`);
		
		if (replicate) {
			console.log('🔄 Falling back to Replicate...');
			return await transcribeWithReplicate(audioBuffer);
		}
		
		throw hfError;
	}
}

async function transcribeWithHuggingFace(audioBuffer, maxRetries = 3) {
	const API_URL = 'https://api-inference.huggingface.co/models/openai/whisper-base';

	const headers = {
		'Content-Type': 'application/octet-stream',
	};

	if (HUGGING_FACE_TOKEN) {
		headers['Authorization'] = `Bearer ${HUGGING_FACE_TOKEN}`;
	}

	let lastError;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(`🎤 Hugging Face attempt ${attempt}/${maxRetries}...`);

			const response = await axios.post(API_URL, audioBuffer, {
				headers,
				timeout: 60000,
				// Add retry config for axios
				validateStatus: (status) => status < 500 || status === 503, // Allow 503 for model loading
			});

			// Check if model is still loading
			if (response.status === 503 || response.data?.error?.includes('loading')) {
				const waitTime = Math.min(attempt * 5000, 20000); // Exponential backoff: 5s, 10s, 20s
				console.log(`⏳ Model loading, waiting ${waitTime/1000}s...`);
				await new Promise(resolve => setTimeout(resolve, waitTime));
				continue; // Retry
			}

			console.log('📦 Response:', JSON.stringify(response.data).substring(0, 200));

			// Extract transcription
			const data = response.data;
			let transcription = null;

			if (typeof data === 'string') {
				transcription = data;
			} else if (data.text) {
				transcription = data.text;
			} else if (data.generated_text) {
				transcription = data.generated_text;
			}

			if (!transcription || typeof transcription !== 'string') {
				throw new Error('Invalid response format');
			}

			console.log(`✅ Transcription: "${transcription.substring(0, 50)}..."`);
			return transcription.trim();

		} catch (error) {
			lastError = error;
			
			if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
				const waitTime = attempt * 2000;
				console.log(`🔄 Connection error, retrying in ${waitTime/1000}s...`);
				await new Promise(resolve => setTimeout(resolve, waitTime));
				continue;
			}

			// Don't retry on 401 or 429
			if (error.response?.status === 401 || error.response?.status === 429) {
				throw error;
			}
			
			// For other errors, wait and retry
			if (attempt < maxRetries) {
				await new Promise(resolve => setTimeout(resolve, 2000));
			}
		}
	}

	throw lastError || new Error('Hugging Face transcription failed after all retries');
}

async function transcribeWithReplicate(audioBuffer) {
	if (!replicate) {
		throw new Error('Replicate not configured');
	}

	console.log('🎤 Using Replicate Whisper...');

	const output = await replicate.run(
		'openai/whisper:91ee9c0c3df30478510ff8c8a3a545add1ad0259ad3a9f78fba57fbc05ee64f7',
		{
			input: {
				audio: audioBuffer,
				language: 'en',
				translate: false,
			}
		}
	);

	const transcription = output.transcription || output.text || output;
	
	if (typeof transcription !== 'string' || transcription.trim().length === 0) {
		throw new Error('Empty transcription from Replicate');
	}

	console.log(`✅ Replicate transcription: "${transcription.substring(0, 50)}..."`);
	return transcription.trim();
}

module.exports = { transcribeAudio };
