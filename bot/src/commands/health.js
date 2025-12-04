import { getAnalyticsSummary } from '../middleware/analytics.js';
import logger from '../utils/logger.js';

/**
 * P1-BOT-015: Health Check Command
 *
 * Features:
 * - Bot status (uptime, memory usage)
 * - Command usage stats
 * - Error rates
 * - Scene activity
 * - Admin-only access
 *
 * Usage:
 *   /health - Show bot health
 */

// Admin user IDs (from environment or config)
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((id) => parseInt(id.trim(), 10))
  .filter((id) => !isNaN(id));

const BOT_START_TIME = Date.now();

/**
 * Format uptime
 */
const formatUptime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

/**
 * Format memory usage
 */
const formatMemory = (bytes) => {
  const mb = Math.round(bytes / 1024 / 1024);
  return `${mb} MB`;
};

/**
 * Handle /health command
 */
export const handleHealthCommand = async (ctx) => {
  try {
    const userId = ctx.from.id;

    // Check if user is admin
    if (ADMIN_IDS.length === 0 || !ADMIN_IDS.includes(userId)) {
      await ctx.reply('This command is only available to administrators.');
      logger.warn('Unauthorized /health command attempt', { userId });
      return;
    }

    logger.info('Admin health check', { userId, username: ctx.from.username });

    // Get system info
    const uptime = Date.now() - BOT_START_TIME;
    const memUsage = process.memoryUsage();

    // Get analytics
    const analytics = getAnalyticsSummary();

    // Build health report
    const lines = [];

    lines.push('BOT HEALTH CHECK\n');

    // System info
    lines.push('System:');
    lines.push(`Uptime: ${formatUptime(uptime)}`);
    lines.push(`Memory: ${formatMemory(memUsage.heapUsed)} / ${formatMemory(memUsage.heapTotal)}`);
    lines.push(`Node.js: ${process.version}`);
    lines.push('');

    // Commands
    lines.push('Commands (top 5):');
    analytics.commands.slice(0, 5).forEach((cmd) => {
      lines.push(`${cmd.command}: ${cmd.count} times, ${cmd.uniqueUsers} users`);
    });
    if (analytics.commands.length === 0) {
      lines.push('No data');
    }
    lines.push('');

    // Scenes
    lines.push('Scenes:');
    analytics.scenes.forEach((scene) => {
      if (scene.activeNow > 0) {
        lines.push(`${scene.scene}: ${scene.activeNow} active`);
      }
    });
    if (analytics.scenes.filter((s) => s.activeNow > 0).length === 0) {
      lines.push('No active scenes');
    }
    lines.push('');

    // Errors
    lines.push('Errors (top 3):');
    analytics.errors.slice(0, 3).forEach((err) => {
      lines.push(`${err.handler}: ${err.errorCount} errors`);
    });
    if (analytics.errors.length === 0) {
      lines.push('No errors');
    }
    lines.push('');

    // Performance
    lines.push('Performance:');
    lines.push(`Average response time: ${analytics.performance.avgResponseTime}ms`);
    lines.push(`Requests tracked: ${analytics.performance.requestsTracked}`);

    const healthReport = lines.join('\n');

    await ctx.reply(healthReport);
  } catch (error) {
    logger.error('Error in /health command:', error);
    await ctx.reply('Error getting bot status.');
  }
};

export default handleHealthCommand;
