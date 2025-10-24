/**
 * Run subscription migration only
 */

const { Pool } = require('pg');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'telegram_shop',
  user: process.env.DB_USER || 'sile',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pool = new Pool(config);

const log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
};

async function runSubscriptionMigration() {
  const client = await pool.connect();
  
  try {
    log.info('Running Subscription Migration...');
    
    // Step 1: Add subscription_status column to shops
    try {
      await client.query(`
        ALTER TABLE shops 
        ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'active' 
        CHECK (subscription_status IN ('active', 'grace_period', 'inactive'))
      `);
      log.success('Added subscription_status column');
    } catch (error) {
      if (error.code === '42701') {
        log.info('subscription_status column already exists');
      } else {
        throw error;
      }
    }

    // Step 2: Add next_payment_due column
    try {
      await client.query(`
        ALTER TABLE shops 
        ADD COLUMN IF NOT EXISTS next_payment_due TIMESTAMP
      `);
      log.success('Added next_payment_due column');
    } catch (error) {
      if (error.code === '42701') {
        log.info('next_payment_due column already exists');
      } else {
        throw error;
      }
    }

    // Step 3: Add grace_period_until column
    try {
      await client.query(`
        ALTER TABLE shops 
        ADD COLUMN IF NOT EXISTS grace_period_until TIMESTAMP
      `);
      log.success('Added grace_period_until column');
    } catch (error) {
      if (error.code === '42701') {
        log.info('grace_period_until column already exists');
      } else {
        throw error;
      }
    }

    // Step 4: Create shop_subscriptions table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS shop_subscriptions (
          id SERIAL PRIMARY KEY,
          shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          tier VARCHAR(20) NOT NULL CHECK (tier IN ('free', 'pro')),
          amount DECIMAL(10, 2) NOT NULL,
          tx_hash VARCHAR(255) UNIQUE NOT NULL,
          currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT', 'TON')),
          period_start TIMESTAMP NOT NULL,
          period_end TIMESTAMP NOT NULL,
          status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
          created_at TIMESTAMP DEFAULT NOW(),
          verified_at TIMESTAMP
        )
      `);
      log.success('Created shop_subscriptions table');
    } catch (error) {
      if (error.code === '42P07') {
        log.info('shop_subscriptions table already exists');
      } else {
        throw error;
      }
    }

    // Step 5: Create indexes
    const indexes = [
      { name: 'idx_shop_subscriptions_shop_id', sql: 'CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_shop_id ON shop_subscriptions(shop_id)' },
      { name: 'idx_shop_subscriptions_status', sql: 'CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_status ON shop_subscriptions(status)' },
      { name: 'idx_shop_subscriptions_tx_hash', sql: 'CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_tx_hash ON shop_subscriptions(tx_hash)' },
      { name: 'idx_shops_subscription_status', sql: 'CREATE INDEX IF NOT EXISTS idx_shops_subscription_status ON shops(subscription_status)' },
      { name: 'idx_shops_next_payment_due', sql: 'CREATE INDEX IF NOT EXISTS idx_shops_next_payment_due ON shops(next_payment_due)' },
    ];

    for (const index of indexes) {
      try {
        await client.query(index.sql);
        log.success(`Created index: ${index.name}`);
      } catch (error) {
        if (error.code === '42P07') {
          log.info(`Index ${index.name} already exists`);
        } else {
          throw error;
        }
      }
    }

    log.success('Subscription migration completed successfully!');
  } catch (error) {
    log.error('Migration failed:');
    console.error(error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runSubscriptionMigration()
  .then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  });
