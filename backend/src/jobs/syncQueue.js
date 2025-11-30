import Queue from 'bull';
import logger from '../utils/logger.js';
import { shopFollowQueries } from '../models/shopFollowQueries.js';
import { syncAllProductsForFollow } from '../services/productSyncService.js';

/**
 * Product Sync Queue
 * Handles background syncing of products for follow relationships
 * Uses Redis for job persistence and Bull for queue management
 */

export const syncQueue = new Queue('product-sync', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs for debugging
  },
});

/**
 * Background worker that processes sync jobs
 * Automatically picks up jobs from the queue
 */
syncQueue.process('sync-products', async (job) => {
  const { followId, sourceShopId, followerShopId } = job.data;

  logger.info(`[SyncQueue] Starting product sync for follow ${followId}`, {
    followId,
    sourceShopId,
    followerShopId,
  });

  try {
    // Update progress
    job.progress(10);

    // Call existing sync logic
    const results = await syncAllProductsForFollow(followId);

    // Update progress
    job.progress(90);

    // Update follow record with sync results
    await shopFollowQueries.findById(followId); // Refresh cached data

    job.progress(100);

    logger.info(`[SyncQueue] Completed product sync for follow ${followId}`, {
      followId,
      results,
    });

    return {
      success: true,
      followId,
      synced: results.synced,
      skipped: results.skipped,
      blockedCopies: results.blockedCopies,
      errors: results.errors,
    };
  } catch (error) {
    logger.error(`[SyncQueue] Sync failed for follow ${followId}:`, {
      followId,
      error: error.message,
      stack: error.stack,
    });
    throw error; // Bull will retry based on job options
  }
});

/**
 * Job event handlers for monitoring
 */
syncQueue.on('completed', (job, result) => {
  logger.info(`[SyncQueue] Job ${job.id} completed successfully`, {
    jobId: job.id,
    followId: result.followId,
    synced: result.synced,
    duration: Date.now() - job.timestamp,
  });
});

syncQueue.on('failed', (job, err) => {
  logger.error(`[SyncQueue] Job ${job.id} failed`, {
    jobId: job.id,
    followId: job.data.followId,
    error: err.message,
    attempts: job.attemptsMade,
    maxAttempts: job.opts.attempts,
  });
});

syncQueue.on('stalled', (job) => {
  logger.warn(`[SyncQueue] Job ${job.id} stalled`, {
    jobId: job.id,
    followId: job.data.followId,
  });
});

syncQueue.on('error', (error) => {
  logger.error(`[SyncQueue] Queue error:`, {
    error: error.message,
    stack: error.stack,
  });
});

/**
 * Check sync status for a follow
 * @param {number} followId - Follow relationship ID
 * @returns {Promise<Object>} Job status
 */
export async function getSyncStatus(followId) {
  try {
    // Check all job states
    const [waiting, active, completed, failed] = await Promise.all([
      syncQueue.getJobs(['waiting', 'delayed']),
      syncQueue.getJobs(['active']),
      syncQueue.getJobs(['completed'], 0, 10), // Last 10 completed
      syncQueue.getJobs(['failed'], 0, 10), // Last 10 failed
    ]);

    // Find job for this follow
    const allJobs = [...waiting, ...active, ...completed, ...failed];
    const job = allJobs.find((j) => j.data.followId === followId);

    if (!job) {
      return { status: 'completed', message: 'No active sync job' };
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      status: state, // 'waiting', 'active', 'completed', 'failed'
      progress,
      jobId: job.id,
      createdAt: new Date(job.timestamp).toISOString(),
      ...(state === 'failed' && { error: job.failedReason }),
      ...(state === 'completed' &&
        job.returnvalue && {
          results: job.returnvalue,
        }),
    };
  } catch (error) {
    logger.error(`Error checking sync status for follow ${followId}:`, error);
    throw error;
  }
}

/**
 * Queue a product sync job
 * @param {number} followId - Follow relationship ID
 * @param {number} sourceShopId - Source shop ID
 * @param {number} followerShopId - Follower shop ID
 * @returns {Promise<Object>} Job details
 */
export async function queueProductSync(followId, sourceShopId, followerShopId) {
  try {
    // Check if there's already an active job for this follow
    const existingStatus = await getSyncStatus(followId);

    if (existingStatus.status === 'active' || existingStatus.status === 'waiting') {
      logger.info(`[SyncQueue] Sync job already queued for follow ${followId}`);
      return existingStatus;
    }

    // Add new job to queue
    const job = await syncQueue.add(
      'sync-products',
      {
        followId,
        sourceShopId,
        followerShopId,
      },
      {
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2s delay, exponentially increase
        },
        timeout: 120000, // 2 minutes timeout
      }
    );

    logger.info(`[SyncQueue] Queued product sync job for follow ${followId}`, {
      jobId: job.id,
      followId,
      sourceShopId,
      followerShopId,
    });

    return {
      status: 'queued',
      jobId: job.id,
      followId,
      message: 'Product sync queued in background',
    };
  } catch (error) {
    logger.error(`Error queueing sync for follow ${followId}:`, error);
    throw error;
  }
}

/**
 * Graceful shutdown
 */
export async function closeQueue() {
  logger.info('[SyncQueue] Closing queue...');
  await syncQueue.close();
  logger.info('[SyncQueue] Queue closed');
}

// Handle process termination
process.on('SIGTERM', async () => {
  await closeQueue();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closeQueue();
  process.exit(0);
});
