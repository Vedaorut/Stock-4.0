/**
 * Migration: Add LTC (Litecoin) support
 * Date: 2025-01-25
 * 
 * Changes:
 * 1. Add wallet_ltc column to users table
 * 2. Update currency CHECK constraints to include LTC
 * 3. USDT already updated to TRC-20 in previous migration
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting migration: Add LTC support');
    
    await client.query('BEGIN');
    
    // Step 1: Add wallet_ltc column to users table
    console.log('📝 Step 1: Adding wallet_ltc column to users table...');
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS wallet_ltc VARCHAR(100);
    `);
    console.log('✅ wallet_ltc column added');
    
    // Step 2: Drop old currency CHECK constraints
    console.log('📝 Step 2: Dropping old currency CHECK constraints...');
    await client.query(`
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_check;
    `);
    await client.query(`
      ALTER TABLE shop_subscriptions DROP CONSTRAINT IF EXISTS shop_subscriptions_currency_check;
    `);
    console.log('✅ Old currency constraints dropped');
    
    // Step 3: Add new currency CHECK constraints with LTC
    console.log('📝 Step 3: Adding new currency constraints (BTC, ETH, USDT, LTC)...');
    
    // payments table
    await client.query(`
      ALTER TABLE payments ADD CONSTRAINT payments_currency_check 
        CHECK (currency IN ('BTC', 'ETH', 'USDT', 'LTC'));
    `);
    console.log('✅ payments.currency CHECK constraint updated (LTC added)');
    
    // shop_subscriptions table
    await client.query(`
      ALTER TABLE shop_subscriptions ADD CONSTRAINT shop_subscriptions_currency_check 
        CHECK (currency IN ('BTC', 'ETH', 'USDT', 'LTC'));
    `);
    console.log('✅ shop_subscriptions.currency CHECK constraint updated (LTC added)');
    
    // Step 4: Verify migration
    console.log('📝 Step 4: Verifying migration...');
    
    // Check wallet_ltc column exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'wallet_ltc';
    `);
    console.log(`✅ wallet_ltc column exists: ${columnCheck.rows.length > 0}`);
    
    // Check constraints
    const constraintCheck = await client.query(`
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name IN ('payments_currency_check', 'shop_subscriptions_currency_check');
    `);
    console.log('✅ Currency constraints updated:');
    constraintCheck.rows.forEach(row => {
      console.log(`   - ${row.constraint_name}: ${row.check_clause}`);
    });
    
    await client.query('COMMIT');
    
    console.log('\n✨ Migration completed successfully!\n');
    console.log('Summary:');
    console.log('- Added wallet_ltc column to users table');
    console.log('- Updated currency constraints: BTC, ETH, USDT, LTC');
    console.log('- USDT is TRC-20 (TR... addresses)');
    console.log('- LTC is Litecoin (L/M/ltc1... addresses)');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('✅ Migration script finished');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrate };
