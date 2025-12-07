/**
 * Schema Validator - проверяет что БД содержит все необходимые колонки
 * Запускается при старте сервера и падает если схема не синхронизирована
 */

import { query } from '../config/database.js';
import logger from './logger.js';

/**
 * Определение ожидаемой схемы БД
 * Обновляй этот объект когда добавляешь новые колонки в queries!
 */
const EXPECTED_SCHEMA = {
  users: {
    columns: [
      'id', 'telegram_id', 'username', 'first_name', 'last_name',
      'selected_role', 'language', 'onboarding_completed',
      'created_at', 'updated_at'
    ],
    nullable: ['username', 'first_name', 'last_name', 'selected_role', 'language']
  },

  shops: {
    columns: [
      'id', 'owner_id', 'name', 'description', 'logo',
      'wallet_btc', 'wallet_eth', 'wallet_usdt', 'wallet_ltc',
      'channel_url', 'tier', 'is_active', 'is_trial', 'trial_ends_at',
      'subscription_status', 'next_payment_due', 'grace_period_until',
      'registration_paid', 'created_at', 'updated_at'
    ],
    nullable: ['description', 'logo', 'wallet_btc', 'wallet_eth', 'wallet_usdt', 'wallet_ltc', 'channel_url', 'trial_ends_at', 'next_payment_due', 'grace_period_until']
  },

  products: {
    columns: [
      'id', 'shop_id', 'name', 'description', 'price', 'currency',
      'stock_quantity', 'reserved_quantity', 'discount_percentage',
      'original_price', 'discount_expires_at', 'is_preorder', 'is_active',
      'created_at', 'updated_at'
    ],
    nullable: ['description', 'original_price', 'discount_expires_at']
  },

  orders: {
    columns: [
      'id', 'buyer_id', 'product_id', 'quantity', 'total_price', 'currency',
      'delivery_address', 'payment_hash', 'payment_address', 'status',
      'crypto_amount', 'crypto_currency', 'notification_sent',
      'created_at', 'updated_at', 'paid_at', 'completed_at'
    ],
    nullable: ['buyer_id', 'product_id', 'delivery_address', 'payment_hash', 'payment_address', 'crypto_amount', 'crypto_currency', 'paid_at', 'completed_at']
  },

  invoices: {
    columns: [
      'id', 'order_id', 'subscription_id', 'chain', 'address', 'address_index',
      'expected_amount', 'crypto_amount', 'usd_rate', 'currency',
      'tatum_subscription_id', 'crystalpay_id', 'crystalpay_url',
      'paid_at', 'tx_hash',
      'status', 'expires_at', 'purpose', 'created_at', 'updated_at'
    ],
    nullable: ['order_id', 'subscription_id', 'address', 'address_index', 'crypto_amount', 'usd_rate', 'tatum_subscription_id', 'crystalpay_id', 'crystalpay_url', 'paid_at', 'tx_hash', 'purpose'],
    checkConstraints: {
      chain: ['BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'LTC', 'CRYSTALPAY']
    }
  },

  shop_subscriptions: {
    columns: [
      'id', 'user_id', 'shop_id', 'tier', 'amount', 'status',
      'period_start', 'period_end', 'payment_method',
      'created_at', 'updated_at'
    ],
    nullable: ['shop_id', 'period_start', 'period_end', 'payment_method']
  },

  payments: {
    columns: [
      'id', 'order_id', 'currency', 'amount', 'tx_hash', 'status',
      'created_at', 'updated_at'
    ],
    nullable: ['tx_hash']
  },

  subscriptions: {
    columns: [
      'id', 'user_id', 'shop_id', 'created_at'
    ],
    nullable: []
  },

  shop_follows: {
    columns: [
      'id', 'follower_shop_id', 'source_shop_id', 'mode',
      'markup_percentage', 'markup_type', 'markup_fixed', 'status',
      'created_at', 'updated_at'
    ],
    nullable: ['markup_type', 'markup_fixed']
  },

  synced_products: {
    columns: [
      'id', 'follow_id', 'synced_product_id', 'source_product_id',
      'last_synced_at', 'conflict_status',
      'custom_markup_type', 'custom_markup_percentage', 'custom_markup_fixed',
      'created_at'
    ],
    nullable: ['custom_markup_type', 'custom_markup_percentage', 'custom_markup_fixed']
  },

  shop_workers: {
    columns: [
      'id', 'shop_id', 'worker_user_id', 'added_by', 'created_at'
    ],
    nullable: []
  },

  promo_codes: {
    columns: [
      'id', 'code', 'type', 'value', 'max_uses', 'used_count',
      'valid_from', 'valid_until', 'is_active', 'created_at'
    ],
    nullable: ['max_uses', 'valid_from', 'valid_until']
  },

  promo_activations: {
    columns: [
      'id', 'promo_code_id', 'user_id', 'subscription_id', 'activated_at'
    ],
    nullable: ['subscription_id']
  },

  refresh_tokens: {
    columns: [
      'id', 'user_id', 'token_hash', 'expires_at', 'created_at', 'revoked_at'
    ],
    nullable: ['revoked_at']
  }
};

/**
 * Получить реальную схему таблицы из БД
 */
async function getTableSchema(tableName) {
  const result = await query(`
    SELECT
      column_name,
      is_nullable,
      data_type
    FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [tableName]);

  return result.rows;
}

/**
 * Получить CHECK constraints для таблицы
 */
async function getCheckConstraints(tableName) {
  const result = await query(`
    SELECT
      conname as constraint_name,
      pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conrelid = $1::regclass AND contype = 'c'
  `, [tableName]);

  return result.rows;
}

/**
 * Валидация схемы БД
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
export async function validateSchema() {
  const errors = [];
  const warnings = [];

  for (const [tableName, expected] of Object.entries(EXPECTED_SCHEMA)) {
    try {
      const actualColumns = await getTableSchema(tableName);

      if (actualColumns.length === 0) {
        errors.push(`Table "${tableName}" does not exist!`);
        continue;
      }

      const actualColumnNames = actualColumns.map(c => c.column_name);

      // Проверка отсутствующих колонок
      for (const col of expected.columns) {
        if (!actualColumnNames.includes(col)) {
          errors.push(`Table "${tableName}": missing column "${col}"`);
        }
      }

      // Проверка nullable constraints
      for (const col of actualColumns) {
        const shouldBeNullable = expected.nullable?.includes(col.column_name);
        const isNullable = col.is_nullable === 'YES';

        if (!shouldBeNullable && isNullable && expected.columns.includes(col.column_name)) {
          // Колонка nullable, но не должна быть - это warning, не error
          // warnings.push(`Table "${tableName}": column "${col.column_name}" is nullable but probably shouldn't be`);
        }

        if (shouldBeNullable && !isNullable) {
          errors.push(`Table "${tableName}": column "${col.column_name}" is NOT NULL but code expects it to be nullable`);
        }
      }

      // Проверка CHECK constraints
      if (expected.checkConstraints) {
        const constraints = await getCheckConstraints(tableName);

        for (const [colName, expectedValues] of Object.entries(expected.checkConstraints)) {
          const constraint = constraints.find(c => c.definition.includes(colName));

          if (constraint) {
            for (const val of expectedValues) {
              if (!constraint.definition.includes(`'${val}'`)) {
                errors.push(`Table "${tableName}": CHECK constraint on "${colName}" missing value '${val}'`);
              }
            }
          }
        }
      }

    } catch (err) {
      if (err.message.includes('does not exist')) {
        errors.push(`Table "${tableName}" does not exist!`);
      } else {
        errors.push(`Table "${tableName}": ${err.message}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Запустить валидацию и выбросить ошибку если схема не валидна
 */
export async function ensureSchemaValid() {
  logger.info('[SchemaValidator] Checking database schema...');

  const result = await validateSchema();

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      logger.warn(`[SchemaValidator] ${warning}`);
    }
  }

  if (!result.valid) {
    logger.error('[SchemaValidator] Schema validation FAILED!');
    for (const error of result.errors) {
      logger.error(`[SchemaValidator] ${error}`);
    }

    // Генерируем SQL для исправления
    logger.error('[SchemaValidator] Run these commands to fix:');
    for (const error of result.errors) {
      if (error.includes('missing column')) {
        const match = error.match(/Table "(\w+)": missing column "(\w+)"/);
        if (match) {
          logger.error(`  ALTER TABLE ${match[1]} ADD COLUMN ${match[2]} TEXT;`);
        }
      }
    }

    throw new Error(`Database schema validation failed with ${result.errors.length} errors. See logs above.`);
  }

  logger.info(`[SchemaValidator] Schema OK (${Object.keys(EXPECTED_SCHEMA).length} tables checked)`);
}

export default { validateSchema, ensureSchemaValid };
