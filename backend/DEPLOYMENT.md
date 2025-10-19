# Deployment Guide

Руководство по развертыванию backend в production.

## Требования

- Node.js 18+
- PostgreSQL 14+
- SSL сертификат (для production)
- Reverse proxy (nginx/Apache)
- Process manager (PM2)

---

## 1. Подготовка сервера

### Ubuntu/Debian
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install nginx
sudo apt install -y nginx

# Install PM2 globally
sudo npm install -g pm2
```

---

## 2. Настройка PostgreSQL

```bash
# Switch to postgres user
sudo -i -u postgres

# Create database and user
createuser telegram_shop_user
createdb telegram_shop
psql -c "ALTER USER telegram_shop_user WITH PASSWORD 'your_secure_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE telegram_shop TO telegram_shop_user;"

# Exit postgres user
exit
```

### Настройка удаленного доступа (если требуется)
```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/14/main/postgresql.conf

# Set listen_addresses
listen_addresses = 'localhost'  # или '*' for all

# Edit pg_hba.conf
sudo nano /etc/postgresql/14/main/pg_hba.conf

# Add line
host    telegram_shop    telegram_shop_user    127.0.0.1/32    md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

---

## 3. Деплой приложения

### Clone repository
```bash
cd /var/www
sudo git clone https://github.com/your-repo/telegram-shop.git
cd telegram-shop/backend
```

### Install dependencies
```bash
npm install --production
```

### Configure environment
```bash
cp .env.example .env
nano .env
```

**Production .env:**
```env
# Server
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://telegram_shop_user:your_secure_password@localhost:5432/telegram_shop

# JWT
JWT_SECRET=generate-strong-random-secret-here
JWT_EXPIRES_IN=7d

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook

# Crypto APIs
BLOCKCHAIN_API_KEY=your-blockchain-api-key
ETHERSCAN_API_KEY=your-etherscan-api-key
TRON_API_KEY=your-tron-api-key

# CORS
FRONTEND_URL=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Run database migrations
```bash
psql -U telegram_shop_user -d telegram_shop -f database/schema.sql
psql -U telegram_shop_user -d telegram_shop -f database/indexes.sql
```

### Set permissions
```bash
sudo chown -R www-data:www-data /var/www/telegram-shop
```

---

## 4. PM2 Configuration

### Create ecosystem file
```bash
nano ecosystem.config.js
```

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [{
    name: 'telegram-shop-api',
    script: './src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10
  }]
};
```

### Start with PM2
```bash
# Create logs directory
mkdir logs

# Start application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd
# Run the command it outputs

# Monitor
pm2 monit
```

### PM2 Commands
```bash
# List processes
pm2 list

# View logs
pm2 logs telegram-shop-api

# Restart
pm2 restart telegram-shop-api

# Stop
pm2 stop telegram-shop-api

# Delete
pm2 delete telegram-shop-api

# Reload (zero downtime)
pm2 reload telegram-shop-api
```

---

## 5. Nginx Configuration

### Create nginx config
```bash
sudo nano /etc/nginx/sites-available/telegram-shop-api
```

**telegram-shop-api:**
```nginx
upstream telegram_shop_api {
    server localhost:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Logs
    access_log /var/log/nginx/telegram-shop-api.access.log;
    error_log /var/log/nginx/telegram-shop-api.error.log;

    # Client body size
    client_max_body_size 10M;

    location / {
        proxy_pass http://telegram_shop_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://telegram_shop_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Health check
    location /health {
        proxy_pass http://telegram_shop_api;
        access_log off;
    }
}
```

### Enable site
```bash
sudo ln -s /etc/nginx/sites-available/telegram-shop-api /etc/nginx/sites-enabled/

# Test nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

## 6. SSL Certificate (Let's Encrypt)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal is set up automatically
# Test renewal
sudo certbot renew --dry-run
```

---

## 7. Firewall Configuration

```bash
# UFW
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Check status
sudo ufw status
```

---

## 8. Monitoring & Logging

### Setup log rotation
```bash
sudo nano /etc/logrotate.d/telegram-shop-api
```

**/etc/logrotate.d/telegram-shop-api:**
```
/var/www/telegram-shop/backend/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    create 0640 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Monitor with PM2
```bash
# Install PM2 monitoring
pm2 install pm2-logrotate

# Configure
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

---

## 9. Database Backup

### Automated backup script
```bash
sudo nano /usr/local/bin/backup-telegram-shop-db.sh
```

**backup-telegram-shop-db.sh:**
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/telegram-shop"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="telegram_shop"
DB_USER="telegram_shop_user"

mkdir -p $BACKUP_DIR

# Backup
pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: backup_$DATE.sql.gz"
```

```bash
# Make executable
sudo chmod +x /usr/local/bin/backup-telegram-shop-db.sh

# Add to crontab (daily at 2 AM)
sudo crontab -e
0 2 * * * /usr/local/bin/backup-telegram-shop-db.sh
```

---

## 10. Performance Optimization

### PostgreSQL tuning
```bash
sudo nano /etc/postgresql/14/main/postgresql.conf
```

**Recommended settings (adjust based on server RAM):**
```ini
# Memory (for 4GB RAM server)
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
work_mem = 16MB

# Checkpoints
checkpoint_completion_target = 0.9
wal_buffers = 16MB

# Planner
random_page_cost = 1.1
effective_io_concurrency = 200

# Connections
max_connections = 100
```

```bash
# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Node.js optimization
- Use cluster mode in PM2 (already configured)
- Enable HTTP/2 in nginx (already configured)
- Use connection pooling (already implemented)

---

## 11. Security Best Practices

### System updates
```bash
# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Fail2ban (protect from brute force)
```bash
sudo apt install fail2ban

# Create jail for nginx
sudo nano /etc/fail2ban/jail.local
```

**/etc/fail2ban/jail.local:**
```ini
[nginx-limit-req]
enabled = true
filter = nginx-limit-req
action = iptables-multiport[name=ReqLimit, port="http,https", protocol=tcp]
logpath = /var/log/nginx/telegram-shop-api.error.log
findtime = 600
bantime = 3600
maxretry = 10
```

```bash
sudo systemctl restart fail2ban
```

### Secure environment variables
```bash
# Ensure .env is not readable by others
chmod 600 /var/www/telegram-shop/backend/.env
```

---

## 12. Health Checks & Monitoring

### Create health check script
```bash
nano /usr/local/bin/health-check.sh
```

**health-check.sh:**
```bash
#!/bin/bash
HEALTH_URL="https://api.yourdomain.com/health"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $response -eq 200 ]; then
    echo "$(date): Health check passed"
    exit 0
else
    echo "$(date): Health check failed with status $response"
    pm2 restart telegram-shop-api
    exit 1
fi
```

```bash
chmod +x /usr/local/bin/health-check.sh

# Add to crontab (every 5 minutes)
crontab -e
*/5 * * * * /usr/local/bin/health-check.sh >> /var/log/health-check.log 2>&1
```

---

## 13. Deployment Checklist

- [ ] Server configured with Node.js, PostgreSQL, nginx
- [ ] Database created and migrations run
- [ ] Environment variables configured
- [ ] SSL certificate installed
- [ ] Application started with PM2
- [ ] Nginx configured and running
- [ ] Firewall enabled
- [ ] Backup script configured
- [ ] Log rotation set up
- [ ] Health checks configured
- [ ] Monitoring enabled
- [ ] Security updates enabled

---

## 14. Troubleshooting

### Check application logs
```bash
pm2 logs telegram-shop-api
```

### Check nginx logs
```bash
sudo tail -f /var/log/nginx/telegram-shop-api.error.log
```

### Check PostgreSQL logs
```bash
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### Test database connection
```bash
psql -U telegram_shop_user -d telegram_shop -c "SELECT COUNT(*) FROM users;"
```

### Restart services
```bash
sudo systemctl restart postgresql
sudo systemctl restart nginx
pm2 restart telegram-shop-api
```

---

## 15. Updates & Maintenance

### Update application
```bash
cd /var/www/telegram-shop/backend
git pull origin main
npm install --production
pm2 reload telegram-shop-api
```

### Database migrations
```bash
psql -U telegram_shop_user -d telegram_shop -f database/new_migration.sql
```

### Clean up
```bash
# Clean old logs
pm2 flush

# Clean old backups (older than 30 days)
find /var/backups/telegram-shop -mtime +30 -delete
```

---

## Support

For issues and questions, contact: support@yourdomain.com
