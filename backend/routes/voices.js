const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const dataStore = require('../services/dataStore');
const elevenlabs = require('../services/elevenlabs');

const router = express.Router();

// Multer configuration for audio file uploads
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
	const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/mp4'];
	if (allowedTypes.includes(file.mimetype)) {
		cb(null, true);
	} else {
		cb(new Error('Invalid file type. Only audio files (MP3, WAV, M4A) are allowed.'), false);
	}
};
const upload = multer({
	storage: storage,
	fileFilter: fileFilter,
	limits: {
		fileSize: 10 * 1024 * 1024, // 10 MB limit
	},
}).array('files', 3);

// GET / - Get all voices
router.get('/', async (req, res) => {
	try {
		const voices = await dataStore.getVoices();
		res.json(voices);
	} catch (error) {
		console.error('❌ Error fetching voices:', error.message);
		res.status(500).json({ error: error.message });
	}
});

// POST / - Create a new voice clone
router.post('/', (req, res, next) => {
	upload(req, res, async (err) => {
		if (err instanceof multer.MulterError) {
			if (err.code === 'LIMIT_FILE_SIZE') {
				return res.status(400).json({ error: 'File size exceeds 10MB limit' });
			} else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
				return res.status(400).json({ error: 'Unexpected field. Expected "files" field.' });
			}
			return res.status(400).json({ error: err.message });
		} else if (err) {
			return res.status(400).json({ error: err.message });
		}

		try {
			const { name, systemPrompt } = req.body;

			// Validation
			if (!name) {
				return res.status(400).json({ error: 'Name is required' });
			}

			if (!systemPrompt) {
				return res.status(400).json({ error: 'System prompt is required' });
			}

			if (!req.files || req.files.length === 0) {
				return res.status(400).json({ error: 'At least one audio file is required' });
			}

			if (req.files.length > 3) {
				return res.status(400).json({ error: 'Maximum 3 audio files allowed' });
			}

			console.log(`📤 Creating voice clone: ${name} with ${req.files.length} file(s)`);

			// Create voice clone with ElevenLabs
			const elevenLabsVoiceId = await elevenlabs.createVoiceClone(name, req.files);

			// Create voice record
			const newVoice = {
				id: uuidv4(),
				name,
				elevenLabsVoiceId,
				systemPrompt,
				createdAt: new Date().toISOString(),
			};

			// Save to data store
			const voices = await dataStore.getVoices();
			voices.push(newVoice);
			await dataStore.saveVoices(voices);

			res.status(201).json(newVoice);
		} catch (error) {
			console.error('❌ Error creating voice clone:', error.message);
			res.status(500).json({ error: error.message });
		}
	});
});

// PUT /:id - Update a voice
router.put('/:id', async (req, res) => {
	try {
		const voices = await dataStore.getVoices();
		const voice = voices.find(v => v.id === req.params.id);

		if (!voice) {
			return res.status(404).json({ error: 'Voice not found' });
		}

		// Update fields if provided
		if (req.body.name) {
			voice.name = req.body.name;
		}

		if (req.body.systemPrompt) {
			voice.systemPrompt = req.body.systemPrompt;
		}

		await dataStore.saveVoices(voices);
		res.json(voice);
	} catch (error) {
		console.error('❌ Error updating voice:', error.message);
		res.status(500).json({ error: error.message });
	}
});

// DELETE /:id - Delete a voice
router.delete('/:id', async (req, res) => {
	try {
		const voices = await dataStore.getVoices();
		const voiceIndex = voices.findIndex(v => v.id === req.params.id);

		if (voiceIndex === -1) {
			return res.status(404).json({ error: 'Voice not found' });
		}

		const voice = voices[voiceIndex];

		// Delete from ElevenLabs
		await elevenlabs.deleteVoiceClone(voice.elevenLabsVoiceId);

		// Remove from local storage
		voices.splice(voiceIndex, 1);
		await dataStore.saveVoices(voices);

		res.status(204).send();
	} catch (error) {
		console.error('❌ Error deleting voice:', error.message);
		res.status(500).json({ error: error.message });
	}
});

module.exports = router;