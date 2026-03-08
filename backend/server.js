/**
 * VoiceRA MVP - Express Server
 * Main entry point for the backend API
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

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

// Async server startup function
async function startServer() {
	const db = require('./services/db');
	await db.init();

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
