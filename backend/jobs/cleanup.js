/**
 * Scheduled Cleanup Job for Abandoned Files
 * Safety fallback to remove local files older than 24 hours
 */

const cron = require('node-cron');
const storage = require('../services/storage');

// Configuration from environment
const CLEANUP_ENABLED = process.env.CLEANUP_ENABLED === 'true';
const CLEANUP_INTERVAL_HOURS = parseInt(process.env.CLEANUP_INTERVAL_HOURS, 10) || 24;
const CLEANUP_AGE_HOURS = parseInt(process.env.CLEANUP_AGE_HOURS, 10) || 24;

let scheduledJob = null;

/**
 * Initialize the scheduled cleanup job
 */
function initializeCleanupJob() {
  if (!CLEANUP_ENABLED) {
    console.log('🧹 Scheduled cleanup is disabled (set CLEANUP_ENABLED=true to enable)');
    return;
  }

  // Validate interval (minimum 1 hour)
  const interval = Math.max(1, CLEANUP_INTERVAL_HOURS);
  
  // Schedule the job using cron expression (run at minute 0 of every Nth hour)
  const cronExpression = `0 */${interval} * * *`;
  
  console.log(`🧹 Initializing cleanup job (interval: ${interval}h, age threshold: ${CLEANUP_AGE_HOURS}h)`);
  console.log(`   Cron: ${cronExpression}`);

  scheduledJob = cron.schedule(cronExpression, async () => {
    console.log(`🧹 Running scheduled cleanup at ${new Date().toISOString()}`);
    await runCleanup();
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  console.log('✅ Cleanup job scheduled');
}

/**
 * Run the cleanup process
 * Find and delete files older than the configured age
 */
async function runCleanup() {
  try {
    const startTime = Date.now();
    
    // Find old files
    const oldFiles = await storage.listOldFiles(CLEANUP_AGE_HOURS);
    
    if (oldFiles.length === 0) {
      console.log('🧹 No abandoned files found');
      return;
    }

    console.log(`🧹 Found ${oldFiles.length} abandoned file(s) to clean up`);

    // Group files by session for efficient deletion
    const sessions = new Map();
    
    for (const file of oldFiles) {
      // Extract sessionId from file path (format: {sessionId}/samples/file.mp3 or {sessionId}/generated/output.mp3)
      const sessionId = file.name.split('/')[0];
      
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, []);
      }
      sessions.get(sessionId).push(file);
    }

    console.log(`🧹 Files belong to ${sessions.size} session(s)`);

    // Delete each session
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const [sessionId, files] of sessions) {
      try {
        console.log(`   Deleting session: ${sessionId} (${files.length} file(s))`);
        await storage.deleteSession(sessionId);
        deletedCount += files.length;
      } catch (error) {
        console.error(`   ❌ Failed to delete session ${sessionId}:`, error.message);
        errorCount += files.length;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Cleanup complete: ${deletedCount} file(s) deleted, ${errorCount} error(s), ${duration}ms`);

  } catch (error) {
    console.error('❌ Cleanup job failed:', error.message);
  }
}

/**
 * Stop the scheduled cleanup job
 */
function stopCleanupJob() {
  if (scheduledJob) {
    scheduledJob.stop();
    console.log('🧹 Cleanup job stopped');
  }
}

/**
 * Manually trigger cleanup (for testing)
 */
async function triggerCleanup() {
  console.log('🧹 Manual cleanup triggered');
  await runCleanup();
}

module.exports = {
  initializeCleanupJob,
  stopCleanupJob,
  triggerCleanup,
  runCleanup
};
