/**
 * Transcription API Endpoint
 * POST /api/transcribe - Transcribe uploaded audio to text
 */

const express = require('express');
const storage = require('../services/storage');
const { transcribeAudio } = require('../services/transcription');

const router = express.Router();

/**
 * POST /api/transcribe
 * Transcribe an uploaded audio file
 * Body: { sessionId, fileId }
 */
router.post('/', async (req, res) => {
	try {
		const { sessionId, fileId } = req.body;

		if (!sessionId || !fileId) {
			return res.status(400).json({
				error: 'Bad Request',
				message: 'sessionId and fileId are required'
			});
		}

		// Only allow transcription for qwen3tts
		if (process.env.VOICE_SERVICE !== 'qwen3tts') {
			return res.status(400).json({
				error: 'Not Available',
				message: 'Transcription is only available with qwen3tts voice service'
			});
		}

		console.log(`🎤 Transcription request for session: ${sessionId}, file: ${fileId}`);

		// Fetch the audio file
		const filePath = `samples/${fileId}`;
		let audioBuffer;
		try {
			audioBuffer = await storage.downloadFileAsBuffer(sessionId, filePath);
		} catch (error) {
			if (error.status === 404 || error.message?.includes('not found')) {
				return res.status(404).json({
					error: 'Not Found',
					message: 'Audio file not found'
				});
			}
			throw error;
		}

		// Transcribe the audio
		const transcription = await transcribeAudio(audioBuffer, fileId);

		res.json({
			success: true,
			transcription,
			fileId,
			sessionId
		});

	} catch (error) {
		console.error('❌ Transcription endpoint error:', error);
		res.status(500).json({
			error: 'Transcription Failed',
			message: error.message || 'Failed to transcribe audio'
		});
	}
});

module.exports = router;
