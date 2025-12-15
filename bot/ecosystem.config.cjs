module.exports = {
  apps: [
    {
      name: 'bot',
      script: 'src/bot.js',
      cwd: '/opt/status-stock/bot',
      interpreter: 'node',
      // 409 CONFLICT PREVENTION: Wait before restarting
      restart_delay: 5000, // 5 seconds delay between restarts
      max_restarts: 10, // Max restarts in 15 minutes
      min_uptime: 10000, // Consider crashed if exits within 10s
      // Environment
      env: {
        NODE_ENV: 'production',
      },
      // Logging
      error_file: '/root/.pm2/logs/bot-error.log',
      out_file: '/root/.pm2/logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Process management
      kill_timeout: 5000,
      wait_ready: false,
      autorestart: true,
    },
  ],
};
