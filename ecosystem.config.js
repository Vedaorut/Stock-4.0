/**
 * PM2 Ecosystem Configuration
 *
 * Используйте PM2 для production deployment:
 *
 * pm2 start ecosystem.config.js
 * pm2 save
 * pm2 startup
 *
 * Управление:
 * pm2 logs            # Просмотр логов
 * pm2 monit           # Мониторинг в реальном времени
 * pm2 restart all     # Перезапуск всех процессов
 * pm2 stop all        # Остановка всех процессов
 * pm2 delete all      # Удаление из списка PM2
 */

module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: './backend',
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 3000,
      kill_timeout: 5000
    },
    {
      name: 'bot',
      cwd: './bot',
      script: 'bot.js',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      error_file: './logs/bot-error.log',
      out_file: './logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ],

  deploy: {
    production: {
      user: 'node',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:username/telegram-shop.git',
      path: '/var/www/telegram-shop',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
