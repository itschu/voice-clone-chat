/**
 * Validation Middleware
 * Reusable validation logic for VoiceRA MVP
 */

// Allowed audio formats
const ALLOWED_FORMATS = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/mp4'];
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a'];

// Size limits
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 3;
const MAX_TEXT_LENGTH = 2500;

/**
 * Validate file format
 * @param {Object} file - Multer file object
 * @returns {boolean}
 */
function isValidFileFormat(file) {
  const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
  return ALLOWED_FORMATS.includes(file.mimetype) || ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Validate file size
 * @param {Object} file - Multer file object
 * @returns {boolean}
 */
function isValidFileSize(file) {
  return file.size <= MAX_FILE_SIZE;
}

/**
 * Validate file count
 * @param {Array} files - Array of files
 * @returns {boolean}
 */
function isValidFileCount(files) {
  return files && files.length >= 1 && files.length <= MAX_FILES;
}

/**
 * Validate text length
 * @param {string} text - Input text
 * @returns {boolean}
 */
function isValidTextLength(text) {
  return text && text.length > 0 && text.length <= MAX_TEXT_LENGTH;
}

/**
 * Get validation error message
 * @param {Array} files - Files to validate
 * @returns {string|null} - Error message or null if valid
 */
function getFileValidationError(files) {
  if (!files || files.length === 0) {
    return 'Please upload at least 1 voice sample.';
  }

  if (files.length > MAX_FILES) {
    return `You can upload up to ${MAX_FILES} samples.`;
  }

  for (const file of files) {
    if (!isValidFileSize(file)) {
      return `File "${file.originalname}" must be under 10MB.`;
    }

    if (!isValidFileFormat(file)) {
      return `File "${file.originalname}" is not a supported format. Upload MP3, WAV, or M4A.`;
    }
  }

  return null;
}

/**
 * Get text validation error
 * @param {string} text - Text to validate
 * @returns {string|null} - Error message or null if valid
 */
function getTextValidationError(text) {
  if (!text || text.trim().length === 0) {
    return 'Please enter text to generate speech.';
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return `Text must be ${MAX_TEXT_LENGTH} characters or fewer.`;
  }

  return null;
}

/**
 * Express middleware to validate upload request
 */
function validateUpload(req, res, next) {
  const files = req.files;
  const error = getFileValidationError(files);

  if (error) {
    return res.status(400).json({
      error: 'Validation Error',
      message: error
    });
  }

  next();
}

/**
 * Express middleware to validate generation request
 */
function validateGeneration(req, res, next) {
  const { sessionId, text, fileIds } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Session ID is required.'
    });
  }

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'At least one file ID is required.'
    });
  }

  const textError = getTextValidationError(text);
  if (textError) {
    return res.status(400).json({
      error: 'Validation Error',
      message: textError
    });
  }

  next();
}

module.exports = {
  ALLOWED_FORMATS,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_TEXT_LENGTH,
  isValidFileFormat,
  isValidFileSize,
  isValidFileCount,
  isValidTextLength,
  getFileValidationError,
  getTextValidationError,
  validateUpload,
  validateGeneration
};
