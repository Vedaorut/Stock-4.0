import { runPeriodicSync } from '../services/productSyncService.js';
import logger from '../utils/logger.js';

let syncInterval = null;

export function startSyncCron() {
  if (syncInterval) {
    logger.warn('Sync cron already running');
    return;
  }
  
  runPeriodicSync().catch(err => logger.error('Initial sync failed:', err));
  
  syncInterval = setInterval(async () => {
    try {
      logger.info('Running periodic product sync...');
      await runPeriodicSync();
    } catch (error) {
      logger.error('Periodic sync failed:', error);
    }
  }, 5 * 60 * 1000);
  
  logger.info('Product sync cron started (every 5 minutes)');
}

export function stopSyncCron() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    logger.info('Product sync cron stopped');
  }
}
