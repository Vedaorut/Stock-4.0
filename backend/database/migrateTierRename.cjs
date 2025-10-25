/**
 * Migration: Rename tier 'free' to 'basic'
 * Date: 2025-10-25
 * 
 * Changes:
 * 1. Update shops.tier: 'free' → 'basic'
 * 2. Update shop_subscriptions.tier: 'free' → 'basic'
 * 3. Update CHECK constraints
 * 4. Remove TON from currency enums
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting migration: Tier rename (free → basic) + Remove TON');
    
    await client.query('BEGIN');
    
    // Step 1: Drop CHECK constraints first (to allow updating data)
    console.log('📝 Step 1: Dropping old CHECK constraints...');
    await client.query(`
      ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_tier_check;
    `);
    await client.query(`
      ALTER TABLE shop_subscriptions DROP CONSTRAINT IF EXISTS shop_subscriptions_tier_check;
    `);
    await client.query(`
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_check;
    `);
    await client.query(`
      ALTER TABLE shop_subscriptions DROP CONSTRAINT IF EXISTS shop_subscriptions_currency_check;
    `);
    console.log('✅ Old constraints dropped');
    
    // Step 2: Update existing 'free' tier data to 'basic'
    console.log('📝 Step 2: Updating shops.tier...');
    const shopsResult = await client.query(
      "UPDATE shops SET tier = 'basic' WHERE tier = 'free'"
    );
    console.log(`✅ Updated ${shopsResult.rowCount} shops`);
    
    // Step 3: Update shop_subscriptions.tier
    console.log('📝 Step 3: Updating shop_subscriptions.tier...');
    const subsResult = await client.query(
      "UPDATE shop_subscriptions SET tier = 'basic' WHERE tier = 'free'"
    );
    console.log(`✅ Updated ${subsResult.rowCount} subscription records`);
    
    // Step 4: Add new CHECK constraints on shops table
    console.log('📝 Step 4: Adding new shops CHECK constraint...');
    await client.query(`
      ALTER TABLE shops ADD CONSTRAINT shops_tier_check 
        CHECK (tier IN ('basic', 'pro'));
    `);
    console.log('✅ shops.tier CHECK constraint updated');
    
    // Step 5: Add new CHECK constraints on shop_subscriptions table
    console.log('📝 Step 5: Adding new shop_subscriptions tier CHECK constraint...');
    await client.query(`
      ALTER TABLE shop_subscriptions ADD CONSTRAINT shop_subscriptions_tier_check 
        CHECK (tier IN ('basic', 'pro'));
    `);
    console.log('✅ shop_subscriptions.tier CHECK constraint updated');
    
    // Step 6: Add new currency CHECK constraints (remove TON)
    console.log('📝 Step 6: Adding new currency constraints (TON removed)...');
    
    // payments table
    await client.query(`
      ALTER TABLE payments ADD CONSTRAINT payments_currency_check 
        CHECK (currency IN ('BTC', 'ETH', 'USDT'));
    `);
    console.log('✅ payments.currency CHECK constraint updated (TON removed)');
    
    // shop_subscriptions table
    await client.query(`
      ALTER TABLE shop_subscriptions ADD CONSTRAINT shop_subscriptions_currency_check 
        CHECK (currency IN ('BTC', 'ETH', 'USDT'));
    `);
    console.log('✅ shop_subscriptions.currency CHECK constraint updated (TON removed)');
    
    // Step 7: Verify migration
    console.log('📝 Step 7: Verifying migration...');
    const verifyShops = await client.query(
      "SELECT tier, COUNT(*) as count FROM shops GROUP BY tier"
    );
    console.log('✅ Shops tier distribution:');
    verifyShops.rows.forEach(row => {
      console.log(`   - ${row.tier}: ${row.count} shops`);
    });
    
    const verifySubs = await client.query(
      "SELECT tier, COUNT(*) as count FROM shop_subscriptions GROUP BY tier"
    );
    console.log('✅ Subscriptions tier distribution:');
    verifySubs.rows.forEach(row => {
      console.log(`   - ${row.tier}: ${row.count} subscriptions`);
    });
    
    // Check for any TON payments (should be 0)
    const tonPayments = await client.query(
      "SELECT COUNT(*) as count FROM payments WHERE currency = 'TON'"
    );
    console.log(`✅ TON payments found: ${tonPayments.rows[0].count} (should be 0)`);
    
    await client.query('COMMIT');
    
    console.log('\n✨ Migration completed successfully!\n');
    console.log('Summary:');
    console.log(`- Shops updated: ${shopsResult.rowCount}`);
    console.log(`- Subscriptions updated: ${subsResult.rowCount}`);
    console.log('- Tier constraints: free → basic');
    console.log('- Currency constraints: TON removed');
    
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
