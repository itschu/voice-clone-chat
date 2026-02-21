/**
 * ElevenLabs Voice Cloning Service
 * Handles Instant Voice Cloning (IVC) and Text-to-Speech (TTS) generation
 */

const axios = require('axios');
const FormData = require('form-data');

// ElevenLabs Configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// API timeout (60 seconds as per spec)
const API_TIMEOUT = 60000;

// Validate configuration
if (!ELEVENLABS_API_KEY) {
	console.warn('⚠️  ElevenLabs API key not configured. Set ELEVENLABS_API_KEY in .env');
}

// Axios instance with default config
const elevenlabsClient = axios.create({
	baseURL: ELEVENLABS_BASE_URL,
	headers: {
		'xi-api-key': ELEVENLABS_API_KEY || '',
	},
	timeout: API_TIMEOUT,
});

/**
 * Check if ElevenLabs is properly configured
 * @returns {boolean}
 */
function isConfigured() {
	return !!ELEVENLABS_API_KEY;
}

/**
 * Create a voice clone using Instant Voice Cloning (IVC)
 * @param {string} name - Name for the voice clone
 * @param {Array<{buffer: Buffer, originalname?: string, filename?: string, mimetype?: string}>} audioFiles - Array of audio file buffers
 * @returns {Promise<string>} - Voice ID
 */
async function createVoiceClone(name, audioFiles) {
	if (!isConfigured()) {
		throw new Error('ElevenLabs API key not configured');
	}

	if (!audioFiles || audioFiles.length === 0) {
		throw new Error('At least one audio file is required for voice cloning');
	}

	try {
		const formData = new FormData();

		// Add voice name
		formData.append('name', name);
		formData.append('description', 'VoiceRA MVP Voice Clone');

		// Add audio files
		audioFiles.forEach((file, index) => {
			// Determine filename with priority: originalname > filename > generated name with extension
			let filename;
			if (file.originalname) {
				filename = file.originalname;
			} else if (file.filename) {
				filename = file.filename;
			} else {
				// Generate filename with appropriate extension based on mimetype
				let extension = '.mp3'; // default
				if (file.mimetype) {
					switch (file.mimetype) {
						case 'audio/wav':
						case 'audio/x-wav':
							extension = '.wav';
							break;
						case 'audio/m4a':
						case 'audio/mp4':
							extension = '.m4a';
							break;
						default:
							extension = '.mp3';
					}
				}
				filename = `sample_${index + 1}${extension}`;
			}

			// Use file's mimetype if available, fallback to 'audio/mpeg'
			const contentType = file.mimetype || 'audio/mpeg';

			formData.append('files', file.buffer, {
				filename: filename,
				contentType: contentType,
			});
		});

		console.log(`🎙️  Creating voice clone with ${audioFiles.length} sample(s)...`);

		const response = await elevenlabsClient.post('/voices/add', formData, {
			headers: {
				...formData.getHeaders(),
				'xi-api-key': ELEVENLABS_API_KEY,
			},
		});

		const voiceId = response.data.voice_id;
		console.log(`✅ Voice clone created: ${voiceId}`);

		return voiceId;
	} catch (error) {
		console.error('❌ Voice clone creation failed:', error.message);

		// Enhance error message with API response details
		if (error.response) {
			const status = error.response.status;
			const data = error.response.data;

			// Log the full error response for debugging
			console.error('   Response status:', status);
			console.error('   Response data:', JSON.stringify(data, null, 2));

			if (status === 401) {
				throw new Error('Invalid ElevenLabs API key');
			} else if (status === 429) {
				throw new Error('ElevenLabs rate limit exceeded. Please try again later.');
			} else if (data) {
				// Extract error message from various possible formats
				let errorMessage = '';
				if (typeof data.detail === 'string') {
					errorMessage = data.detail;
				} else if (typeof data.detail === 'object' && data.detail !== null) {
					errorMessage = JSON.stringify(data.detail);
				} else if (data.message) {
					errorMessage = data.message;
				} else {
					errorMessage = JSON.stringify(data);
				}
				throw new Error(`ElevenLabs API error: ${errorMessage}`);
			}
		}

		throw new Error(`Failed to create voice clone: ${error.message}`);
	}
}

/**
 * Generate speech using a voice ID
 * @param {string} voiceId - The voice ID from createVoiceClone
 * @param {string} text - Text to convert to speech
 * @param {Object} options - Optional TTS options
 * @returns {Promise<Buffer>} - Audio buffer (MP3)
 */
async function generateSpeech(voiceId, text, options = {}) {
	if (!isConfigured()) {
		throw new Error('ElevenLabs API key not configured');
	}

	if (!voiceId) {
		throw new Error('Voice ID is required');
	}

	if (!text || text.trim().length === 0) {
		throw new Error('Text is required for speech generation');
	}

	// Check text length (ElevenLabs free tier limit is 10k chars, but our MVP limits to 2500)
	if (text.length > 2500) {
		throw new Error('Text exceeds maximum length of 2500 characters');
	}

	const defaultOptions = {
		model_id: process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
		voice_settings: {
			stability: 0.5,
			similarity_boost: 0.75,
		},
	};

	const requestBody = {
		text: text.trim(),
		...defaultOptions,
		...options,
	};

	try {
		console.log(`🔊 Generating speech (${text.length} chars) with voice ${voiceId}...`);

		const response = await elevenlabsClient.post(`/text-to-speech/${voiceId}`, requestBody, {
			responseType: 'arraybuffer',
			headers: {
				Accept: 'audio/mpeg',
				'xi-api-key': ELEVENLABS_API_KEY,
			},
		});

		const audioBuffer = Buffer.from(response.data);
		console.log(`✅ Speech generated: ${audioBuffer.length} bytes`);

		return audioBuffer;
	} catch (error) {
		console.error('❌ Speech generation failed:', error.message);

		// Enhance error message with API response details
		if (error.response) {
			const status = error.response.status;

			// Log the full error response for debugging
			console.error('   Response status:', status);

			if (status === 401) {
				throw new Error('Invalid ElevenLabs API key');
			} else if (status === 404) {
				throw new Error('Voice not found. It may have been deleted.');
			} else if (status === 429) {
				throw new Error('ElevenLabs rate limit exceeded. Please try again later.');
			} else {
				// Try to parse error details from arraybuffer response
				let errorMessage = 'Unknown error';
				try {
					const errorText = Buffer.from(error.response.data).toString('utf-8');
					const errorJson = JSON.parse(errorText);

					if (typeof errorJson.detail === 'string') {
						errorMessage = errorJson.detail;
					} else if (typeof errorJson.detail === 'object' && errorJson.detail !== null) {
						errorMessage = JSON.stringify(errorJson.detail);
					} else if (errorJson.message) {
						errorMessage = errorJson.message;
					} else {
						errorMessage = JSON.stringify(errorJson);
					}
				} catch (e) {
					// If parsing fails, use raw data
					errorMessage = error.response.data?.toString() || 'Unknown error';
				}
				throw new Error(`ElevenLabs API error: ${errorMessage}`);
			}
		}

		throw new Error(`Failed to generate speech: ${error.message}`);
	}
}

/**
 * Transcribe speech to text using ElevenLabs Speech-to-Text
 * @param {Buffer} audioBuffer - Audio buffer to transcribe
 * @param {string} mimeType - MIME type of audio (e.g., 'audio/webm', 'audio/mp3')
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeSpeech(audioBuffer, mimeType) {
	if (!isConfigured()) {
		throw new Error('ElevenLabs API key not configured');
	}

	if (!audioBuffer || audioBuffer.length === 0) {
		throw new Error('Audio buffer is required for transcription');
	}

	try {
		const formData = new FormData();
		formData.append('file', audioBuffer, {
			filename: 'audio.webm',
			contentType: mimeType,
		});
		formData.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v1');

		console.log('🎙️ Transcribing speech...');

		const response = await elevenlabsClient.post('/speech-to-text', formData, {
			headers: {
				...formData.getHeaders(),
				'xi-api-key': ELEVENLABS_API_KEY,
			},
		});

		const text = response.data.text;
		console.log(`✅ Transcription complete`);

		return text;
	} catch (error) {
		console.error('❌ Transcription failed:', error.message);

		if (error.response) {
			const status = error.response.status;
			const data = error.response.data;

			if (status === 401) {
				throw new Error('Invalid ElevenLabs API key');
			} else if (status === 429) {
				throw new Error('ElevenLabs rate limit exceeded. Please try again later.');
			} else if (data) {
				let errorMessage = '';
				if (typeof data.detail === 'string') {
					errorMessage = data.detail;
				} else if (typeof data.detail === 'object' && data.detail !== null) {
					errorMessage = JSON.stringify(data.detail);
				} else if (data.message) {
					errorMessage = data.message;
				} else {
					errorMessage = JSON.stringify(data);
				}
				throw new Error(`ElevenLabs API error: ${errorMessage}`);
			}
		}

		throw error;
	}
}

/**
 * Get available voices from ElevenLabs account
 * @returns {Promise<Array>} - List of voices
 */
async function getVoices() {
	if (!isConfigured()) {
		throw new Error('ElevenLabs API key not configured');
	}

	try {
		const response = await elevenlabsClient.get('/voices');
		return response.data.voices || [];
	} catch (error) {
		console.error('❌ Failed to fetch voices:', error.message);
		throw error;
	}
}

/**
 * Delete a voice clone from ElevenLabs
 * @param {string} voiceId - The voice ID to delete
 * @throws {Error} If voiceId is missing, service not configured, or API returns error
 */
async function deleteVoiceClone(voiceId) {
	if (!isConfigured()) {
		throw new Error('ElevenLabs API key not configured');
	}

	if (!voiceId) {
		throw new Error('Voice ID is required for deletion');
	}

	try {
		console.log(`🗑️  Deleting voice clone: ${voiceId}`);

		const response = await elevenlabsClient.delete(`/voices/${voiceId}`, {
			headers: {
				'xi-api-key': ELEVENLABS_API_KEY,
			},
		});

		console.log(`✅ Voice clone deleted successfully: ${voiceId}`);
		return response.data;
	} catch (error) {
		console.error('❌ Voice clone deletion failed:', error.message);

		// Enhance error message with API response details
		if (error.response) {
			const status = error.response.status;
			const data = error.response.data;

			// Log the full error response for debugging
			console.error('   Response status:', status);
			if (data) {
				console.error('   Response data:', JSON.stringify(data, null, 2));
			}

			if (status === 401) {
				throw new Error('Invalid ElevenLabs API key');
			} else if (status === 404) {
				throw new Error('Voice not found. It may have already been deleted.');
			} else if (status === 429) {
				throw new Error('ElevenLabs rate limit exceeded. Please try again later.');
			} else if (data) {
				// Extract error message from various possible formats
				let errorMessage = '';
				if (typeof data.detail === 'string') {
					errorMessage = data.detail;
				} else if (typeof data.detail === 'object' && data.detail !== null) {
					errorMessage = JSON.stringify(data.detail);
				} else if (data.message) {
					errorMessage = data.message;
				} else {
					errorMessage = JSON.stringify(data);
				}
				throw new Error(`ElevenLabs API error: ${errorMessage}`);
			}
		}

		throw new Error(`Failed to delete voice clone: ${error.message}`);
	}
}

module.exports = {
	isConfigured,
	createVoiceClone,
	generateSpeech,
	transcribeSpeech,
	getVoices,
	deleteVoiceClone,
};
