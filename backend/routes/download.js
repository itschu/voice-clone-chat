/**
 * Download API Endpoint
 * GET /api/download/:sessionId/:filename - Stream audio and cleanup after download
 */

const express = require('express');
const storage = require('../services/storage');

const router = express.Router();

/**
 * GET /api/download/:sessionId/:filename
 * Stream audio file from local storage and delete files after download completes
 */
router.get('/:sessionId/:filename', async (req, res) => {
  const { sessionId, filename } = req.params;
  const filePath = `generated/${filename}`;

  try {
    console.log(`📥 Download request for session: ${sessionId}, file: ${filename}, range: ${req.headers.range || 'none'}`);

    // Get file metadata first to set content type
    let metadata;
    try {
      metadata = await storage.getFileMetadata(sessionId, filePath);
    } catch (error) {
      if (error.status === 404) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Audio file not found. It may have already been downloaded or expired.'
        });
      }
      throw error;
    }

    // Set response headers
    res.setHeader('Content-Type', metadata.contentType || 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="voicera_${sessionId.split('_')[0]}.mp3"`);
    res.setHeader('Content-Length', metadata.size);

    // Stream the file from local storage
    const stream = await storage.downloadFile(sessionId, filePath);

    // Track if download completed successfully
    let downloadCompleted = false;

    stream.on('end', () => {
      downloadCompleted = true;
      console.log(`✅ Download completed for session: ${sessionId}`);
      
      // Only cleanup on full downloads (not range requests for audio preview)
      // Delay cleanup to allow replay/re-download
      if (!req.headers.range) {
        setTimeout(() => cleanupSession(sessionId), 5 * 60 * 1000); // 5 minutes
      }
    });

    stream.on('error', (error) => {
      console.error(`❌ Stream error for session ${sessionId}:`, error.message);
      // Don't cleanup on error - user might retry
    });

    // Handle client disconnect
    req.on('close', () => {
      if (!downloadCompleted) {
        console.log(`⚠️  Client disconnected during download for session: ${sessionId}`);
      }
    });

    // Pipe the stream to response
    stream.pipe(res);

  } catch (error) {
    console.error(`❌ Download failed for session ${sessionId}:`, error);
    
    // If headers not sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Download Failed',
        message: error.message || 'Failed to download audio. Please try again.'
      });
    }
  }
});

/**
 * Cleanup session files after download
 * @param {string} sessionId 
 */
async function cleanupSession(sessionId) {
  try {
    console.log(`🧹 Cleaning up session: ${sessionId}`);
    await storage.deleteSession(sessionId);
    console.log(`✅ Cleanup complete for session: ${sessionId}`);
  } catch (error) {
    // Log but don't throw - download already succeeded
    console.error(`⚠️  Cleanup failed for session ${sessionId}:`, error.message);
  }
}

module.exports = router;
