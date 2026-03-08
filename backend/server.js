/**
 * VoiceRA MVP - Express Server
 * Main entry point for the backend API
 */

require('dotenv').config();
const fs = require('fs').promises;
const dataStore = require('./services/dataStore');
const storage = require('./services/storage');
const express = require('express');
const path = require('path');
const cors = require('cors');

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '../data/audio');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - only needed if frontend is on different origin
// For same-origin (Express serving frontend), CORS is not required
if (process.env.NODE_ENV === 'development' && process.env.ENABLE_CORS === 'true') {
	app.use(cors());
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Health check endpoint
app.get('/api/health', (req, res) => {
	res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/voices', require('./routes/voices'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/audio', require('./routes/audio'));
app.use('/api/settings', require('./routes/settings'));
// app.use('/api/cleanup', require('./routes/cleanup')); // Optional - will add in Batch 3

// Fire-and-forget OpenRouter startup validation
const openrouterStatus = require('./services/openrouterStatus');
openrouterStatus.validateRuntime().catch(() => {});

/**
 * Purge orphaned conversations that have no audio files on disk.
 * Runs at startup to clean up DB records whose files are missing (e.g., after volume switch).
 */
async function purgeOrphanedConversations() {
	try {
		const conversations = await dataStore.listConversations();
		let deleted = 0;

		for (const conv of conversations) {
			const fullConv = await dataStore.getConversation(conv.id);
			const assistantMessages = fullConv.messages?.filter((m) => m.role === 'assistant') || [];

			// Skip if no assistant messages (nothing to check)
			if (assistantMessages.length === 0) continue;

			// Check if any audio file exists for this conversation
			const accessChecks = assistantMessages.map((msg) =>
				fs.access(storage.getFilePath(conv.id, msg.id + '.mp3'))
					.then(() => true)
					.catch(() => false)
			);

			const results = await Promise.all(accessChecks);
			const anyExists = results.some((exists) => exists);

			if (!anyExists) {
				// No audio files exist for this conversation → purge it
				await dataStore.deleteConversation(conv.id);
				deleted++;
			}
		}

		console.log(`🧹 Purged ${deleted} orphaned conversations (audio files missing from volume)`);
	} catch (error) {
		console.error('❌ Error purging orphaned conversations:', error.message);
	}
}

/**
 * Purge orphaned audio directories that have no matching conversation in the DB.
 * Runs at startup to clean up files left behind after DB resets or deletions.
 */
async function purgeOrphanedAudioFiles() {
	try {
		// Check if STORAGE_DIR exists
		try {
			await fs.access(STORAGE_DIR);
		} catch (error) {
			if (error.code === 'ENOENT') {
				console.log('⚠️ STORAGE_DIR does not exist yet, skipping orphan audio cleanup');
				return;
			}
			throw error;
		}

		const entries = await fs.readdir(STORAGE_DIR, { withFileTypes: true });
		const dirs = entries.filter((e) => e.isDirectory());
		let deleted = 0;

		for (const dir of dirs) {
			try {
				await dataStore.getConversation(dir.name);
				// Conversation exists → keep the directory
			} catch (error) {
				if (error.status === 404) {
					// No matching conversation → purge the directory
					await storage.deleteSession(dir.name);
					deleted++;
				} else {
					console.error(`❌ Error checking conversation ${dir.name}:`, error.message);
				}
			}
		}

		console.log(`🧹 Purged ${deleted} orphaned audio directories (no matching conversation in DB)`);
	} catch (error) {
		console.error('❌ Error purging orphaned audio files:', error.message);
	}
}

// Async server startup function
async function startServer() {
	const db = require('./services/db');
	await db.init();
	await purgeOrphanedConversations().catch((err) => console.error('⚠️ orphan conv cleanup failed:', err.message));
	await purgeOrphanedAudioFiles().catch((err) => console.error('⚠️ orphan audio cleanup failed:', err.message));

	app.listen(PORT, () => {
		console.log(`🎙️  VoiceRA Conversational AI Server running on http://localhost:${PORT}`);
		console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
	});
}

// Start server with error handling
startServer().catch((err) => {
	console.error('❌ Failed to start server:', err);
	process.exit(1);
});

module.exports = app;
