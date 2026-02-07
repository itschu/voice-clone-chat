/**
 * Voice Generation API Endpoint
 * POST /api/generate
 */

const express = require('express');
const storage = require('../services/storage');
const voiceFactory = require('../services/voiceFactory'); // CHANGED
const { validateGeneration } = require('../middleware/validation');

const router = express.Router();
const GENERATION_TIMEOUT = 120000; // Increased to 2 mins for slower models

router.post('/', validateGeneration, async (req, res) => {
	try {
		const { sessionId, text, fileIds } = req.body;

		// Check configuration
		if (!voiceFactory.isConfigured()) {
			return res.status(503).json({
				error: 'Service Unavailable',
				message: `The selected service (${process.env.VOICE_SERVICE}) is not configured.`,
			});
		}

		console.log(`🎙️  Starting generation (${process.env.VOICE_SERVICE || 'default'}) for: ${sessionId}`);

		// Timeout Promise
		const timeoutPromise = new Promise((_, reject) => {
			setTimeout(() => {
				reject(new Error('Generation timeout'));
			}, GENERATION_TIMEOUT);
		});

		// 1. Fetch Samples
		const fetchSamplesPromise = fetchSamples(sessionId, fileIds);
		const audioSamples = await Promise.race([fetchSamplesPromise, timeoutPromise]);

		// 2. Generate (Unified Interface)
		// The factory handles the specific logic (Clone vs Zero-shot)
		const result = await voiceFactory.generate(sessionId, text, audioSamples);
		const { audioBuffer, voiceId } = result;

		// 3. Save Output
		const outputPath = 'generated/output.mp3';
		await storage.uploadFile(sessionId, outputPath, audioBuffer, {
			originalFilename: 'output.mp3',
			mimeType: 'audio/mpeg',
			fileSize: audioBuffer.length,
			voiceId: voiceId,
			service: process.env.VOICE_SERVICE,
		});

		console.log(`✅ Generation complete. Voice ID: ${voiceId}`);

		res.json({
			audioUrl: `/api/download/${sessionId}/output.mp3`,
			voiceId: voiceId,
			generatedAt: new Date().toISOString(),
		});
	} catch (error) {
		console.error('❌ Generation failed:', error.message);

		let statusCode = 500;
		if (error.message?.includes('timeout')) statusCode = 504;

		res.status(statusCode).json({
			error: 'Generation Failed',
			message: error.message || 'Failed to generate voice.',
		});
	}
});

// Helper: Fetch samples (Same as before)
async function fetchSamples(sessionId, fileIds) {
	const samples = [];
	for (const fileId of fileIds) {
		const filePath = `samples/${fileId}`;
		try {
			const buffer = await storage.downloadFileAsBuffer(sessionId, filePath);
			samples.push({ buffer, filename: fileId });
		} catch (error) {
			if (error.status === 404) throw new Error(`Sample missing: ${fileId}`);
			throw error;
		}
	}
	return samples;
}

module.exports = router;
