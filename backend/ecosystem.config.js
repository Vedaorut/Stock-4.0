module.exports = {
  apps: [{
    name: 'telegram-shop-api',
    script: './src/server.js',

    // Instances
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',

    // Environment
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },

    // Logs
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Restart policy
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,

    // Kill timeout
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 3000,

    // Advanced features
    instance_var: 'INSTANCE_ID',

    // Source map support
    source_map_support: true,

    // Graceful start/shutdown
    shutdown_with_message: true,

    // Cron restart (optional - restart daily at 4 AM)
    // cron_restart: '0 4 * * *',

    // Additional settings
    vizion: false,
    post_update: ['npm install'],
  }]
};
