/**
 * Upload API Endpoint
 * POST /api/upload - Accept voice samples, validate, store locally
 */

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const storage = require('../services/storage');
const { getFileValidationError } = require('../middleware/validation');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 3 // Max 3 files
  }
});

/**
 * POST /api/upload
 * Accept 1-3 audio files, validate, save locally, return sessionId + file metadata
 */
router.post('/', upload.array('files', 3), async (req, res) => {
  try {
    const files = req.files;

    // Validate files
    const validationError = getFileValidationError(files);
    if (validationError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationError
      });
    }

    // Generate session ID: {timestamp}_{randomUUID}
    const timestamp = Date.now();
    const randomId = uuidv4();
    const sessionId = `${timestamp}_${randomId}`;

    console.log(`📤 Processing upload for session: ${sessionId}`);
    console.log(`   Files: ${files.length}`);

    // Save files locally
    const uploadedFiles = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = `sample_${i + 1}${getFileExtension(file.originalname)}`;
      const filePath = `samples/${fileId}`;

      // Save to local storage
      await storage.uploadFile(sessionId, filePath, file.buffer, {
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size
      });

      uploadedFiles.push({
        fileId: fileId,
        filename: file.originalname,
        size: file.size
      });
    }

    console.log(`✅ Upload complete for session: ${sessionId}`);

    // Return response per Tech Plan schema
    res.status(201).json({
      sessionId: sessionId,
      files: uploadedFiles
    });

  } catch (error) {
    console.error('❌ Upload failed:', error);
    
    res.status(500).json({
      error: 'Upload Failed',
      message: error.message || 'Failed to upload files. Please try again.'
    });
  }
});

/**
 * Get file extension from filename
 * @param {string} filename 
 * @returns {string}
 */
function getFileExtension(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (['.mp3', '.wav', '.m4a'].includes(ext)) {
    return ext;
  }
  return '.mp3'; // Default to mp3
}

module.exports = router;
