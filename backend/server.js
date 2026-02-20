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
// TODO: app.use('/api/conversations', require('./routes/conversations'));
// TODO: app.use('/api/audio', require('./routes/audio'));
// app.use('/api/cleanup', require('./routes/cleanup')); // Optional - will add in Batch 3

// Serve frontend for all other routes (SPA support)
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
	console.error('Error:', err);
	res.status(err.status || 500).json({
		error: err.message || 'Internal Server Error',
		...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
	});
});

// Start server
app.listen(PORT, () => {
	console.log(`🎙️  VoiceRA Conversational AI Server running on http://localhost:${PORT}`);
	console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
