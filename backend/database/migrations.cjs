/**
 * Database Migration Script
 * Executes SQL migrations for Telegram E-Commerce Platform
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'telegram_ecommerce',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pool = new Pool(config);

// Color console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.cyan}${colors.bright}${msg}${colors.reset}\n`),
};

/**
 * Read SQL file
 */
function readSQLFile(filename) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Execute SQL query
 */
async function executeSQL(sql, description) {
  const client = await pool.connect();
  try {
    log.info(`Executing: ${description}...`);
    await client.query(sql);
    log.success(`${description} completed`);
  } catch (error) {
    log.error(`${description} failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if database exists
 */
async function databaseExists(dbName) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Create database if not exists
 */
async function createDatabase(dbName) {
  // Connect to default postgres database to create new database
  const defaultPool = new Pool({
    ...config,
    database: 'postgres',
  });

  const client = await defaultPool.connect();
  try {
    const exists = await databaseExists(dbName);
    if (!exists) {
      log.info(`Creating database: ${dbName}`);
      await client.query(`CREATE DATABASE ${dbName}`);
      log.success(`Database ${dbName} created`);
    } else {
      log.info(`Database ${dbName} already exists`);
    }
  } finally {
    client.release();
    await defaultPool.end();
  }
}

/**
 * Run schema migration
 */
async function runSchema() {
  log.header('Running Schema Migration');
  const sql = readSQLFile('schema.sql');
  await executeSQL(sql, 'Schema creation');
}

/**
 * Run indexes migration
 */
async function runIndexes() {
  log.header('Creating Database Indexes');
  const sql = readSQLFile('indexes.sql');
  await executeSQL(sql, 'Index creation');
}

/**
 * Run seed migration
 */
async function runSeed() {
  log.header('Seeding Test Data');
  const sql = readSQLFile('seed.sql');
  await executeSQL(sql, 'Data seeding');
}

/**
 * Run incremental migration: Add selected_role to users table
 */
async function addSelectedRoleColumn() {
  log.header('Running Incremental Migration: Add selected_role Column');
  const client = await pool.connect();
  try {
    // Check if column already exists
    log.info('Checking if selected_role column exists...');
    const checkResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name = 'selected_role'
    `);

    if (checkResult.rows.length > 0) {
      log.warning('Column selected_role already exists, skipping migration');
      return;
    }

    // Add the column
    log.info('Adding selected_role column to users table...');
    await client.query(`
      ALTER TABLE users
      ADD COLUMN selected_role VARCHAR(20)
      CHECK (selected_role IN ('buyer', 'seller'))
    `);
    log.success('Column selected_role added successfully');

    // Add the index
    log.info('Creating index on selected_role...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_selected_role ON users(selected_role)
    `);
    log.success('Index idx_users_selected_role created successfully');

    log.success('Migration completed: selected_role column added');
  } catch (error) {
    log.error(`Migration failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run incremental migration: Migrate products to USD-only pricing
 * - Add wallet_ton to shops table
 * - Remove currency constraint from products (products now in USD only)
 */
async function migrateProductsToUSD() {
  log.header('Running Incremental Migration: Products to USD-only pricing');
  const client = await pool.connect();
  try {
    // Step 1: Add wallet_ton to shops table
    log.info('Checking if wallet_ton column exists in shops...');
    const checkWalletTon = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'shops'
      AND column_name = 'wallet_ton'
    `);

    if (checkWalletTon.rows.length === 0) {
      log.info('Adding wallet_ton column to shops table...');
      await client.query(`
        ALTER TABLE shops
        ADD COLUMN wallet_ton VARCHAR(255)
      `);
      log.success('Column wallet_ton added successfully');
    } else {
      log.warning('Column wallet_ton already exists, skipping');
    }

    // Step 2: Remove NOT NULL constraint from products.currency
    log.info('Removing NOT NULL constraint from products.currency...');
    await client.query(`
      ALTER TABLE products
      ALTER COLUMN currency DROP NOT NULL
    `);
    log.success('NOT NULL constraint removed from products.currency');

    // Step 3: Update comment for products.price
    log.info('Updating comment for products.price...');
    await client.query(`
      COMMENT ON COLUMN products.price IS 'Product price in USD (8 decimal precision)'
    `);
    log.success('Comment updated for products.price');

    log.success('Migration completed: Products migrated to USD-only pricing');
  } catch (error) {
    log.error(`Migration failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run incremental migration: Remove currency constraint for USD support
 * This fixes the bug where products cannot be created with USD currency
 */
async function removeCurrencyConstraint() {
  log.header('Running Incremental Migration: Remove Currency Constraint for USD Support');
  const client = await pool.connect();
  try {
    // Check if constraint exists
    log.info('Checking if products_currency_check constraint exists...');
    const checkResult = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'products'
      AND constraint_name = 'products_currency_check'
    `);

    if (checkResult.rows.length > 0) {
      log.info('Removing products_currency_check constraint...');
      await client.query('ALTER TABLE products DROP CONSTRAINT products_currency_check;');
      log.success('Currency constraint removed');

      // Set default value to USD
      log.info('Setting default currency to USD...');
      await client.query("ALTER TABLE products ALTER COLUMN currency SET DEFAULT 'USD';");
      log.success('Default currency set to USD');

      // Update any existing NULL currencies to USD
      log.info('Updating existing NULL currencies to USD...');
      const updateResult = await client.query("UPDATE products SET currency = 'USD' WHERE currency IS NULL;");
      log.success(`Updated ${updateResult.rowCount} products with NULL currency`);
    } else {
      log.warning('Currency constraint already removed, skipping');
    }

    log.success('Migration completed: Products can now use USD currency');
  } catch (error) {
    log.error(`Migration failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run incremental migration: Add NOT NULL constraint to payments.payment_address
 * This prevents payment verification failures due to NULL addresses
 */
async function addPaymentAddressConstraint() {
  log.header('Running Incremental Migration: Add NOT NULL constraint to payments.payment_address');
  const client = await pool.connect();
  try {
    // Check if column allows NULL
    log.info('Checking if payment_address allows NULL...');
    const checkResult = await client.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'payments'
      AND column_name = 'payment_address'
    `);

    if (checkResult.rows.length === 0) {
      log.warning('Column payment_address does not exist, skipping');
      return;
    }

    if (checkResult.rows[0].is_nullable === 'YES') {
      log.info('Adding NOT NULL constraint to payment_address...');
      await client.query(`
        ALTER TABLE payments
        ALTER COLUMN payment_address SET NOT NULL
      `);
      log.success('NOT NULL constraint added to payment_address');
    } else {
      log.warning('Column payment_address already NOT NULL, skipping');
    }

    log.success('Migration completed: payment_address now requires a value');
  } catch (error) {
    log.error(`Migration failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run incremental migration: Add Follow Shop feature tables
 * - Creates shop_follows table (follower → source shop relationships)
 * - Creates synced_products table (tracks synced products)
 * - Adds indexes for performance
 */
async function addFollowShopFeature() {
  log.header('Running Incremental Migration: Add Follow Shop Feature');
  const client = await pool.connect();
  try {
    // Step 1: Check if shop_follows table already exists
    log.info('Checking if shop_follows table exists...');
    const checkShopFollows = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'shop_follows'
    `);

    if (checkShopFollows.rows.length > 0) {
      log.warning('Table shop_follows already exists, verifying constraints');

      // Ensure markup defaults to 0 for monitor mode
      await client.query(`
        ALTER TABLE shop_follows
        ALTER COLUMN markup_percentage SET DEFAULT 0
      `);

      // Replace legacy constraint that required markup >= 1
      await client.query(`
        ALTER TABLE shop_follows
        DROP CONSTRAINT IF EXISTS shop_follows_markup_percentage_check
      `);
      await client.query(`
        ALTER TABLE shop_follows
        ADD CONSTRAINT shop_follows_markup_percentage_check
        CHECK (markup_percentage >= 0 AND markup_percentage <= 500)
      `);

      log.success('Existing shop_follows table constraints updated');
      return;
    }

    // Step 2: Create shop_follows table
    log.info('Creating shop_follows table...');
    await client.query(`
      CREATE TABLE shop_follows (
        id SERIAL PRIMARY KEY,
        follower_shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        source_shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        mode VARCHAR(20) NOT NULL CHECK (mode IN ('monitor', 'resell')),
        markup_percentage DECIMAL(5, 2) DEFAULT 0 CHECK (markup_percentage >= 0 AND markup_percentage <= 500),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_shop_id, source_shop_id),
        CHECK (follower_shop_id != source_shop_id)
      )
    `);
    log.success('Table shop_follows created successfully');

    // Step 3: Create synced_products table
    log.info('Creating synced_products table...');
    await client.query(`
      CREATE TABLE synced_products (
        id SERIAL PRIMARY KEY,
        follow_id INT NOT NULL REFERENCES shop_follows(id) ON DELETE CASCADE,
        synced_product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        source_product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        conflict_status VARCHAR(20) DEFAULT 'synced' CHECK (conflict_status IN ('synced', 'conflict', 'manual_override')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(synced_product_id),
        UNIQUE(follow_id, source_product_id),
        CHECK (synced_product_id != source_product_id)
      )
    `);
    log.success('Table synced_products created successfully');

    // Step 4: Add indexes on shop_follows
    log.info('Creating indexes on shop_follows...');
    await client.query('CREATE INDEX idx_shop_follows_follower ON shop_follows(follower_shop_id)');
    await client.query('CREATE INDEX idx_shop_follows_source ON shop_follows(source_shop_id)');
    await client.query('CREATE INDEX idx_shop_follows_mode ON shop_follows(mode)');
    await client.query('CREATE INDEX idx_shop_follows_status ON shop_follows(status)');
    log.success('Indexes on shop_follows created successfully');

    // Step 5: Add indexes on synced_products
    log.info('Creating indexes on synced_products...');
    await client.query('CREATE INDEX idx_synced_products_follow ON synced_products(follow_id)');
    await client.query('CREATE INDEX idx_synced_products_synced ON synced_products(synced_product_id)');
    await client.query('CREATE INDEX idx_synced_products_source ON synced_products(source_product_id)');
    await client.query('CREATE INDEX idx_synced_products_conflict ON synced_products(conflict_status)');
    log.success('Indexes on synced_products created successfully');

    // Step 6: Add comments for documentation
    log.info('Adding table comments...');
    await client.query(`
      COMMENT ON TABLE shop_follows IS 'Tracks follower→source shop relationships for dropshipping/reseller functionality';
      COMMENT ON TABLE synced_products IS 'Tracks synced products between follower and source shops';
      COMMENT ON COLUMN shop_follows.mode IS 'monitor: just watch, resell: auto-copy with markup';
      COMMENT ON COLUMN shop_follows.markup_percentage IS 'Markup percentage for resell mode (1-500%)';
      COMMENT ON COLUMN synced_products.conflict_status IS 'synced: in sync, conflict: manual edit detected, manual_override: user chose to keep manual edits';
    `);
    log.success('Table comments added successfully');

    log.success('Migration completed: Follow Shop feature tables created');
  } catch (error) {
    log.error(`Migration failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Rollback incremental migration: Remove Follow Shop feature tables
 * Use with caution - this will delete all follow relationships and synced products!
 */
async function rollbackFollowShopFeature() {
  log.header('Rolling back Follow Shop Feature');
  log.warning('This will delete all follow relationships and synced products!');
  const client = await pool.connect();
  try {
    log.info('Dropping synced_products table...');
    await client.query('DROP TABLE IF EXISTS synced_products CASCADE');
    log.success('Table synced_products dropped');

    log.info('Dropping shop_follows table...');
    await client.query('DROP TABLE IF EXISTS shop_follows CASCADE');
    log.success('Table shop_follows dropped');

    log.success('Rollback completed: Follow Shop feature removed');
  } catch (error) {
    log.error(`Rollback failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Enable required PostgreSQL extensions
 */
async function enableExtensions() {
  log.header('Enabling PostgreSQL Extensions');
  const client = await pool.connect();
  try {
    // Enable pg_trgm for fuzzy text search
    log.info('Enabling pg_trgm extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    log.success('pg_trgm extension enabled');

    // Enable uuid-ossp for UUID generation (optional)
    log.info('Enabling uuid-ossp extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    log.success('uuid-ossp extension enabled');
  } catch (error) {
    log.error(`Extension setup failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Verify database tables
 */
async function verifyTables() {
  log.header('Verifying Database Tables');
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    log.info('Tables found:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    const expectedTables = [
      'users', 'shops', 'products', 'orders',
      'order_items', 'subscriptions', 'payments'
    ];

    const foundTables = result.rows.map(r => r.table_name);
    const missing = expectedTables.filter(t => !foundTables.includes(t));

    if (missing.length > 0) {
      log.warning(`Missing tables: ${missing.join(', ')}`);
    } else {
      log.success('All expected tables present');
    }
  } finally {
    client.release();
  }
}

/**
 * Show database statistics
 */
async function showStats() {
  log.header('Database Statistics');
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        n_live_tup as rows
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);

    console.log('\nTable Statistics:');
    console.log('─'.repeat(70));
    console.log(
      'Table'.padEnd(25) +
      'Rows'.padEnd(15) +
      'Size'.padEnd(15)
    );
    console.log('─'.repeat(70));

    result.rows.forEach(row => {
      console.log(
        row.tablename.padEnd(25) +
        row.rows.toString().padEnd(15) +
        row.size.padEnd(15)
      );
    });
    console.log('─'.repeat(70));
  } finally {
    client.release();
  }
}

/**
 * Drop all tables (careful!)
 */
async function dropAllTables() {
  log.header('Dropping All Tables');
  log.warning('This will delete all data!');

  const client = await pool.connect();
  try {
    await client.query(`
      DROP TABLE IF EXISTS synced_products CASCADE;
      DROP TABLE IF EXISTS shop_follows CASCADE;
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS subscriptions CASCADE;
      DROP TABLE IF EXISTS order_items CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS products CASCADE;
      DROP TABLE IF EXISTS shops CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);
    log.success('All tables dropped');
  } finally {
    client.release();
  }
}

/**
 * Main migration runner
 */
async function migrate(options = {}) {
  const {
    dropTables = false,
    schema = true,
    indexes = true,
    seed = false,
    extensions = true,
    verify = true,
    stats = false,
    addSelectedRole = false,
  } = options;

  try {
    log.header('Database Migration Started');
    log.info(`Database: ${config.database}`);
    log.info(`Host: ${config.host}:${config.port}`);
    log.info(`User: ${config.user}`);

    // Test connection
    const client = await pool.connect();
    log.success('Database connection successful');
    client.release();

    // Drop tables if requested
    if (dropTables) {
      await dropAllTables();
    }

    // Enable extensions
    if (extensions) {
      await enableExtensions();
    }

    // Run schema migration
    if (schema) {
      await runSchema();
    }

    // Run indexes migration
    if (indexes) {
      await runIndexes();
    }

    // Run seed data
    if (seed) {
      await runSeed();
    }

    // Run incremental migrations
    if (addSelectedRole) {
      await addSelectedRoleColumn();
    }

    if (options.migrateToUSD) {
      await migrateProductsToUSD();
    }

    if (options.removeCurrencyConstraint) {
      await removeCurrencyConstraint();
    }

    if (options.fixPaymentAddress) {
      await addPaymentAddressConstraint();
    }

    if (options.addFollowShop) {
      await addFollowShopFeature();
    }

    if (options.rollbackFollowShop) {
      await rollbackFollowShopFeature();
    }

    // Verify tables
    if (verify) {
      await verifyTables();
    }

    // Show statistics
    if (stats) {
      await showStats();
    }

    log.header('Migration Completed Successfully!');
  } catch (error) {
    log.error(`Migration failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * CLI argument parser
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dropTables: args.includes('--drop'),
    schema: !args.includes('--no-schema'),
    indexes: !args.includes('--no-indexes'),
    seed: args.includes('--seed'),
    extensions: !args.includes('--no-extensions'),
    verify: !args.includes('--no-verify'),
    stats: args.includes('--stats'),
    addSelectedRole: args.includes('--add-selected-role'),
    migrateToUSD: args.includes('--migrate-to-usd'),
    removeCurrencyConstraint: args.includes('--fix-currency'),
    fixPaymentAddress: args.includes('--fix-payment-address'),
    addFollowShop: args.includes('--add-follow-shop'),
    rollbackFollowShop: args.includes('--rollback-follow-shop'),
  };

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Database Migration Tool

Usage: node migrations.js [options]

Options:
  --drop                 Drop all tables before migration (destructive!)
  --seed                 Seed test data after migration
  --stats                Show database statistics after migration
  --add-selected-role    Run incremental migration: Add selected_role column to users table
  --migrate-to-usd       Run incremental migration: Migrate products to USD-only pricing
  --fix-currency         Run incremental migration: Remove currency constraint to allow USD
  --fix-payment-address  Run incremental migration: Add NOT NULL constraint to payments.payment_address
  --add-follow-shop      Run incremental migration: Add Follow Shop feature (shop_follows + synced_products tables)
  --rollback-follow-shop Rollback Follow Shop feature (WARNING: deletes all follow data!)
  --no-schema            Skip schema migration
  --no-indexes           Skip index creation
  --no-extensions        Skip extension setup
  --no-verify            Skip table verification
  -h, --help             Show this help message

Examples:
  node migrations.js                          # Run basic migration
  node migrations.js --drop --seed            # Fresh install with test data
  node migrations.js --seed --stats           # Add test data and show stats
  node migrations.js --add-selected-role      # Add selected_role column (incremental)
  node migrations.js --migrate-to-usd         # Migrate products to USD-only pricing
  node migrations.js --fix-currency           # Fix currency constraint to allow USD
  node migrations.js --fix-payment-address    # Add NOT NULL constraint to payments.payment_address
  node migrations.js --add-follow-shop        # Add Follow Shop feature tables
  node migrations.js --rollback-follow-shop   # Remove Follow Shop feature (DESTRUCTIVE)
  node migrations.js --no-indexes             # Run without indexes
    `);
    process.exit(0);
  }

  return options;
}

// Run migration if called directly
if (require.main === module) {
  const options = parseArgs();
  migrate(options);
}

// Export functions for programmatic use
module.exports = {
  migrate,
  runSchema,
  runIndexes,
  runSeed,
  enableExtensions,
  verifyTables,
  showStats,
  dropAllTables,
  addSelectedRoleColumn,
  migrateProductsToUSD,
  removeCurrencyConstraint,
  addPaymentAddressConstraint,
  addFollowShopFeature,
  rollbackFollowShopFeature,
};
