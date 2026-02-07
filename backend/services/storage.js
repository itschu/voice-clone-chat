/**
 * Local Filesystem Storage Service
 * Handles file operations for VoiceRA MVP (stores files on server)
 */

const fs = require('fs').promises;
const path = require('path');

// Storage configuration
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '../../uploads');

// Ensure storage directory exists
async function ensureStorageDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    console.error('❌ Failed to create storage directory:', error.message);
    throw error;
  }
}

// Initialize on module load
ensureStorageDir().then(() => {
  console.log('✅ Local storage initialized at:', STORAGE_DIR);
});

/**
 * Check if storage is available
 * @returns {boolean}
 */
function isConfigured() {
  return true; // Local storage is always available
}

/**
 * Get session directory path
 * @param {string} sessionId 
 * @returns {string}
 */
function getSessionDir(sessionId) {
  return path.join(STORAGE_DIR, sessionId);
}

/**
 * Get file path within session
 * @param {string} sessionId 
 * @param {string} filePath 
 * @returns {string}
 */
function getFilePath(sessionId, filePath) {
  return path.join(STORAGE_DIR, sessionId, filePath);
}

/**
 * Upload a file to local storage
 * @param {string} sessionId - Session identifier
 * @param {string} filePath - Path within session (e.g., 'samples/file.mp3' or 'generated/output.mp3')
 * @param {Buffer} buffer - File data
 * @param {Object} metadata - Optional metadata (stored in a sidecar JSON file)
 * @returns {Promise<string>} - File path
 */
async function uploadFile(sessionId, filePath, buffer, metadata = {}) {
  const fullPath = getFilePath(sessionId, filePath);
  const dir = path.dirname(fullPath);

  try {
    // Create session directory if needed
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, buffer);

    // Write metadata sidecar file
    const metadataPath = `${fullPath}.meta.json`;
    const metaData = {
      uploadedAt: new Date().toISOString(),
      originalFilename: metadata.originalFilename || 'unknown',
      fileSize: buffer.length,
      mimeType: metadata.mimeType || 'application/octet-stream',
      sessionId: sessionId,
      ...metadata
    };
    await fs.writeFile(metadataPath, JSON.stringify(metaData, null, 2));

    console.log(`✅ Saved to local storage: ${filePath} (${buffer.length} bytes)`);
    return filePath;
  } catch (error) {
    console.error(`❌ Local storage save failed for ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Download a file as a stream
 * @param {string} sessionId - Session identifier
 * @param {string} filePath - Path within session
 * @returns {Promise<fs.ReadStream>} - File stream
 */
async function downloadFile(sessionId, filePath) {
  const fullPath = getFilePath(sessionId, filePath);

  try {
    // Check if file exists
    await fs.access(fullPath);

    console.log(`📥 Streaming from local storage: ${filePath}`);
    const { createReadStream } = require('fs');
    return createReadStream(fullPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const err = new Error(`File not found: ${filePath}`);
      err.status = 404;
      throw err;
    }
    throw error;
  }
}

/**
 * Download a file as a buffer
 * @param {string} sessionId - Session identifier
 * @param {string} filePath - Path within session
 * @returns {Promise<Buffer>} - File buffer
 */
async function downloadFileAsBuffer(sessionId, filePath) {
  const fullPath = getFilePath(sessionId, filePath);

  try {
    const buffer = await fs.readFile(fullPath);
    console.log(`✅ Read from local storage: ${filePath} (${buffer.length} bytes)`);
    return buffer;
  } catch (error) {
    if (error.code === 'ENOENT') {
      const err = new Error(`File not found: ${filePath}`);
      err.status = 404;
      throw err;
    }
    throw error;
  }
}

/**
 * Delete a specific file
 * @param {string} sessionId - Session identifier
 * @param {string} filePath - Path within session
 */
async function deleteFile(sessionId, filePath) {
  const fullPath = getFilePath(sessionId, filePath);
  const metadataPath = `${fullPath}.meta.json`;

  try {
    // Delete file
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    // Delete metadata file
    try {
      await fs.unlink(metadataPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    console.log(`🗑️  Deleted from local storage: ${filePath}`);
  } catch (error) {
    console.error(`❌ Delete failed for ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Delete all files in a session folder
 * @param {string} sessionId - Session identifier
 */
async function deleteSession(sessionId) {
  const sessionDir = getSessionDir(sessionId);

  try {
    // Check if directory exists
    try {
      await fs.access(sessionDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`⚠️  Session directory not found: ${sessionId}`);
        return;
      }
      throw error;
    }

    // Read directory contents
    const entries = await fs.readdir(sessionDir, { withFileTypes: true });

    // Delete all files and subdirectories
    for (const entry of entries) {
      const entryPath = path.join(sessionDir, entry.name);
      if (entry.isDirectory()) {
        // Recursively delete subdirectory
        const subEntries = await fs.readdir(entryPath);
        for (const subEntry of subEntries) {
          await fs.unlink(path.join(entryPath, subEntry)).catch(() => {});
        }
        await fs.rmdir(entryPath);
      } else {
        await fs.unlink(entryPath);
      }
    }

    // Remove session directory
    await fs.rmdir(sessionDir);

    console.log(`🗑️  Deleted session: ${sessionId}`);
  } catch (error) {
    console.error(`❌ Session delete failed for ${sessionId}:`, error.message);
    throw error;
  }
}

/**
 * List files older than specified hours
 * @param {number} ageInHours - Age threshold in hours
 * @returns {Promise<Array>} - Array of file objects
 */
async function listOldFiles(ageInHours = 24) {
  const cutoffTime = Date.now() - ageInHours * 60 * 60 * 1000;
  const oldFiles = [];

  try {
    // Read all session directories
    const sessions = await fs.readdir(STORAGE_DIR, { withFileTypes: true });

    for (const session of sessions) {
      if (!session.isDirectory()) continue;

      const sessionDir = path.join(STORAGE_DIR, session.name);
      const sessionStat = await fs.stat(sessionDir);

      // Check session directory age
      if (sessionStat.mtime.getTime() < cutoffTime) {
        // This session is old - find all files in it
        const entries = await fs.readdir(sessionDir, { recursive: true });
        for (const entry of entries) {
          const entryPath = path.join(sessionDir, entry);
          const stat = await fs.stat(entryPath);
          if (stat.isFile() && !entry.endsWith('.meta.json')) {
            oldFiles.push({
              name: `${session.name}/${entry}`,
              uploadedAt: stat.mtime.toISOString(),
              size: stat.size
            });
          }
        }
      }
    }

    console.log(`📋 Found ${oldFiles.length} files older than ${ageInHours} hours`);
    return oldFiles;
  } catch (error) {
    console.error('❌ List old files failed:', error.message);
    throw error;
  }
}

/**
 * Get file metadata
 * @param {string} sessionId - Session identifier
 * @param {string} filePath - Path within session
 * @returns {Promise<Object>} - File metadata
 */
async function getFileMetadata(sessionId, filePath) {
  const fullPath = getFilePath(sessionId, filePath);
  const metadataPath = `${fullPath}.meta.json`;

  try {
    const stat = await fs.stat(fullPath);
    let customMetadata = {};

    // Try to read metadata file
    try {
      const metaContent = await fs.readFile(metadataPath, 'utf-8');
      customMetadata = JSON.parse(metaContent);
    } catch (error) {
      // Metadata file may not exist
    }

    return {
      name: filePath,
      size: stat.size,
      contentType: customMetadata.mimeType || 'audio/mpeg',
      timeCreated: stat.birthtime.toISOString(),
      updated: stat.mtime.toISOString(),
      customMetadata
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      const err = new Error(`File not found: ${filePath}`);
      err.status = 404;
      throw err;
    }
    throw error;
  }
}

module.exports = {
  isConfigured,
  uploadFile,
  downloadFile,
  downloadFileAsBuffer,
  deleteFile,
  deleteSession,
  listOldFiles,
  getFileMetadata,
  getSessionDir,
  getFilePath
};
