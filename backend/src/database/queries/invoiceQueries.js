import { query } from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Invoice database queries (HD wallet address-per-payment with BIP44 derivation)
 */
export const invoiceQueries = {
  // Create invoice with generated address
  create: async (invoiceData) => {
    const {
      orderId,
      chain,
      address,
      addressIndex,
      expectedAmount,
      currency,
      webhookSubscriptionId,
      expiresAt,
      purpose = 'order',
    } = invoiceData;
    const result = await query(
      `INSERT INTO invoices (order_id, chain, address, address_index, expected_amount, currency, tatum_subscription_id, expires_at, status, purpose)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
       RETURNING *`,
      [
        orderId,
        chain,
        address,
        addressIndex,
        expectedAmount,
        currency,
        webhookSubscriptionId,
        expiresAt,
        purpose,
      ]
    );
    return result.rows[0];
  },

  // Find invoice by payment address
  findByAddress: async (address) => {
    const result = await query('SELECT * FROM invoices WHERE address = $1', [address]);
    return result.rows[0];
  },

  // Find invoice by order ID
  findByOrderId: async (orderId) => {
    const result = await query(
      'SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orderId]
    );
    return result.rows[0];
  },

  // Get next address index for chain
  // ✅ FIX: Use PostgreSQL SEQUENCE for atomic, race-condition-free index generation
  getNextIndex: async (chain) => {
    // Map chain to sequence name (e.g., BTC -> wallet_address_index_btc)
    const sequenceName = `wallet_address_index_${chain.toLowerCase()}`;

    try {
      const result = await query(`SELECT nextval($1::regclass) as next_index`, [sequenceName]);
      // Convert to integer (PostgreSQL returns bigint as string)
      return parseInt(result.rows[0].next_index, 10);
    } catch (error) {
      logger.error('[DB] getNextIndex error', {
        chain,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Failed to get next index for ${chain}: ${error.message}`);
    }
  },

  // Update invoice status
  updateStatus: async (id, status, txHash = null) => {
    const normalizedStatus = String(status);
    const isPaid = normalizedStatus === 'paid';

    const result = await query(
      `UPDATE invoices
       SET status = $2::VARCHAR,
           paid_at = CASE WHEN $4::BOOLEAN THEN NOW() ELSE paid_at END,
           tx_hash = COALESCE($3::VARCHAR, tx_hash),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, normalizedStatus, txHash, isPaid]
    );
    return result.rows[0];
  },

  // Find expired invoices (for cleanup)
  findExpired: async () => {
    const result = await query(
      `SELECT * FROM invoices
       WHERE status = 'pending'
       AND expires_at < NOW()`,
      []
    );
    return result.rows;
  },

  // Find pending invoices by chains (for polling service)
  findPendingByChains: async (chains) => {
    const result = await query(
      `SELECT * FROM invoices
       WHERE status = 'pending'
       AND chain = ANY($1)
       AND expires_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at ASC`,
      [chains]
    );
    return result.rows;
  },
};

export default invoiceQueries;
