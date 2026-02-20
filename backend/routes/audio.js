const express = require('express');
const storage = require('../services/storage');

const router = express.Router();

// UUIDv4 regex validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIO_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp3$/i;

// GET /:conversationId/:filename - stream audio file
router.get('/:conversationId/:filename', async (req, res) => {
  try {
    // Validate UUID format
    if (!UUID_RE.test(req.params.conversationId) || !AUDIO_RE.test(req.params.filename)) {
      return res.status(400).json({ error: 'Invalid audio path' });
    }

    const stream = await storage.downloadFile(req.params.conversationId, req.params.filename);
    res.setHeader('Content-Type', 'audio/mpeg');
    stream.pipe(res);
  } catch (error) {
    console.error('❌ Error streaming audio:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to stream audio' });
  }
});

module.exports = router;