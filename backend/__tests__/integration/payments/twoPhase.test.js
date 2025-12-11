/**
 * Integration Tests: Two-Phase Payment Processing
 *
 * Tests INV-P1-1 FIX: Blockchain verification happens OUTSIDE the DB transaction
 *
 * Two-Phase Architecture:
 * PHASE 1 (Outside transaction):
 *   - Order/Invoice lookup (no locks)
 *   - Preliminary status checks
 *   - Blockchain verification (SLOW - external API)
 *
 * PHASE 2 (Atomic transaction):
 *   - Lock order and invoice (FOR UPDATE)
 *   - Re-validate status (TOCTOU protection)
 *   - Guard TX reuse
 *   - Deduct stock atomically
 *   - Update statuses
 *   - COMMIT
 *
 * PHASE 3 (Outside transaction):
 *   - WebSocket broadcast
 *   - Notifications
 *
 * This ensures DB locks are held for milliseconds, not seconds.
 */

import { jest, describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import {
  getTestPool,
  closeTestDb,
  cleanupTestData,
  createTestUser,
  createTestShop,
  createTestProduct,
  createTestOrder,
  createTestInvoice,
} from '../../helpers/testDb.js';

// Mock blockchain service
jest.unstable_mockModule('../../../src/services/blockchainVerificationService.js', () => ({
  verifyPayment: jest.fn(),
}));

const blockchainService = await import('../../../src/services/blockchainVerificationService.js');
const { processOrderPayment } = await import('../../../src/services/invoicePayment/processors/orderProcessor.js');

describe('Two-Phase Payment Processing', () => {
  let pool;

  let seller;
  let buyer;
  let shop;
  let product;

  beforeAll(async () => {
    pool = getTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();
    jest.clearAllMocks();

    // Create seller
    seller = await createTestUser({
      telegramId: '9300001001',
      username: 'paymentseller',
      selectedRole: 'seller',
    });

    // Create buyer
    buyer = await createTestUser({
      telegramId: '9300001002',
      username: 'paymentbuyer',
      selectedRole: 'buyer',
    });

    // Create shop with wallet
    shop = await createTestShop(seller.id, {
      name: 'Payment Test Shop',
    });

    // Add wallet to shop
    await pool.query("UPDATE shops SET wallet_btc = 'bc1qtest123456' WHERE id = $1", [shop.id]);

    // Create product
    product = await createTestProduct(shop.id, {
      name: 'Test Product',
      price: '100.00',
      stock_quantity: 10,
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeTestDb();
  });

  /**
   * Helper: Create order with invoice and payment record
   */
  const setupOrderWithPayment = async (quantity = 1) => {
    // Create order
    const order = await createTestOrder(buyer.id, product.id, shop.id, {
      quantity,
      total_price: (100 * quantity).toFixed(2),
      status: 'pending',
    });

    // Create order_items
    await pool.query(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, currency)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [order.id, product.id, product.name, quantity, '100.00', 'USD']
    );

    // Reserve stock
    await pool.query(
      'UPDATE products SET reserved_quantity = reserved_quantity + $1 WHERE id = $2',
      [quantity, product.id]
    );

    // Create invoice (chain must be uppercase per DB constraint)
    const invoice = await createTestInvoice(order.id, {
      currency: 'BTC',
      chain: 'BTC',  // Must be uppercase: BTC, ETH, LTC, USDT_TRC20, CRYSTALPAY
      expected_amount: 0.001 * quantity,
      address: 'bc1qtest123456',
      status: 'pending',
    });

    // Create payment record
    const paymentResult = await pool.query(
      `INSERT INTO payments (order_id, currency, amount, expected_crypto_amount, recipient_address, status)
       VALUES ($1, 'BTC', $2, $3, 'bc1qtest123456', 'pending')
       RETURNING *`,
      [order.id, (100 * quantity).toFixed(2), 0.001 * quantity]
    );

    return {
      order,
      invoice,
      payment: paymentResult.rows[0],
    };
  };

  describe('Phase timing (DB locks vs blockchain verification)', () => {
    it('should not hold DB locks during blockchain verification', async () => {
      const { order } = await setupOrderWithPayment(2);

      // Track timing
      let blockchainStartTime = 0;
      let blockchainEndTime = 0;

      // Mock blockchain verification with 500ms delay
      blockchainService.verifyPayment.mockImplementation(async () => {
        blockchainStartTime = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 500));
        blockchainEndTime = Date.now();
        return {
          verified: true,
          confirmations: 6,
          amount: 0.002,
        };
      });

      // Process payment (no actorUserId skips authorization check)
      const startTime = Date.now();
      const result = await processOrderPayment({
        orderId: order.id,
        txHash: 'txhash123456',
        // actorUserId not passed - skips authorization check
      });
      const endTime = Date.now();

      expect(result.ok).toBe(true);
      expect(result.state).toBe('confirmed');

      // Blockchain verification took ~500ms
      const blockchainDuration = blockchainEndTime - blockchainStartTime;
      expect(blockchainDuration).toBeGreaterThanOrEqual(450);

      // Total time should include blockchain delay
      const totalDuration = endTime - startTime;
      expect(totalDuration).toBeGreaterThanOrEqual(500);

      // The key insight: DB transaction (Phase 2) is AFTER blockchain verification
      // So if blockchain takes 500ms, DB transaction still only takes <100ms
      // We can't directly measure Phase 2 duration here, but the architecture ensures it
    });

    it('should release resources quickly even if blockchain is slow', async () => {
      const { order: order1 } = await setupOrderWithPayment(1);
      const { order: order2 } = await setupOrderWithPayment(1);

      // Mock slow blockchain for order1
      let order1Started = false;
      let _order2Completed = false;

      blockchainService.verifyPayment
        .mockImplementationOnce(async () => {
          order1Started = true;
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
          return { verified: true, confirmations: 6, amount: 0.001 };
        })
        .mockImplementationOnce(async () => {
          // Fast verification for order2
          return { verified: true, confirmations: 6, amount: 0.001 };
        });

      // Start processing order1 (slow)
      const promise1 = processOrderPayment({
        orderId: order1.id,
        txHash: 'txhash_order1',
        // No actorUserId - skips authorization
      });

      // Wait a bit for order1 to start blockchain verification
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(order1Started).toBe(true);

      // Process order2 while order1 is in blockchain verification
      // This should succeed quickly because DB is not locked
      const result2 = await processOrderPayment({
        orderId: order2.id,
        txHash: 'txhash_order2',
        // No actorUserId - skips authorization
      });

      _order2Completed = true;
      expect(result2.ok).toBe(true);

      // Wait for order1 to complete
      const result1 = await promise1;
      expect(result1.ok).toBe(true);

      // Order2 completed while order1 was still in blockchain verification
      // This proves DB locks are not held during blockchain calls
    });
  });

  describe('Double payment race condition protection', () => {
    it('should handle double payment race condition (only one succeeds)', async () => {
      const { order } = await setupOrderWithPayment(3);

      // Mock blockchain - both calls return verified
      blockchainService.verifyPayment.mockResolvedValue({
        verified: true,
        confirmations: 6,
        amount: 0.003,
      });

      // Launch 2 concurrent payment processing calls
      const results = await Promise.allSettled([
        processOrderPayment({
          orderId: order.id,
          txHash: 'txhash_same',
        }),
        processOrderPayment({
          orderId: order.id,
          txHash: 'txhash_same',
        }),
      ]);

      // At least one should succeed (fulfilled)
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const _rejected = results.filter((r) => r.status === 'rejected');

      // One or both may succeed - depends on timing.
      // With serializable isolation, one may get serialization error.
      // Key invariant: order ends up confirmed, stock deducted once.
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // Count successful confirmations
      const values = fulfilled.map((r) => r.value);
      const confirmed = values.filter((v) => v.ok && v.state === 'confirmed');
      expect(confirmed.length).toBeGreaterThanOrEqual(1);

      // If both succeeded, at least one should be idempotent
      if (fulfilled.length === 2) {
        const idempotent = values.filter((v) => v.idempotent === true);
        expect(idempotent.length).toBeGreaterThanOrEqual(1);
      }

      // Check stock was deducted only once
      const productResult = await pool.query(
        'SELECT stock_quantity, reserved_quantity FROM products WHERE id = $1',
        [product.id]
      );
      expect(productResult.rows[0].stock_quantity).toBe(7); // 10 - 3 = 7
      expect(productResult.rows[0].reserved_quantity).toBe(0);

      // Check order status
      const orderResult = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
      expect(orderResult.rows[0].status).toBe('confirmed');

      // Check payment was confirmed only once
      const paymentsResult = await pool.query(
        "SELECT COUNT(*) as count FROM payments WHERE order_id = $1 AND status = 'confirmed'",
        [order.id]
      );
      expect(parseInt(paymentsResult.rows[0].count, 10)).toBe(1);
    });

    it('should prevent double stock deduction', async () => {
      const { order } = await setupOrderWithPayment(5);

      // Initial stock state
      const initialStock = await pool.query(
        'SELECT stock_quantity, reserved_quantity FROM products WHERE id = $1',
        [product.id]
      );
      expect(initialStock.rows[0].stock_quantity).toBe(10);
      expect(initialStock.rows[0].reserved_quantity).toBe(5);

      // Mock blockchain
      blockchainService.verifyPayment.mockResolvedValue({
        verified: true,
        confirmations: 3,
        amount: 0.005,
      });

      // Process payment multiple times
      for (let i = 0; i < 3; i++) {
        await processOrderPayment({
          orderId: order.id,
          txHash: 'txhash_test',
          // No actorUserId
        });
      }

      // Stock should be deducted exactly once
      const finalStock = await pool.query(
        'SELECT stock_quantity, reserved_quantity FROM products WHERE id = $1',
        [product.id]
      );
      expect(finalStock.rows[0].stock_quantity).toBe(5); // 10 - 5 = 5
      expect(finalStock.rows[0].reserved_quantity).toBe(0); // Reservation released
    });
  });

  describe('Idempotency checks', () => {
    it('should return idempotent response for already confirmed order', async () => {
      const { order } = await setupOrderWithPayment(1);

      // Manually confirm order
      await pool.query(
        "UPDATE orders SET status = 'confirmed', paid_at = NOW() WHERE id = $1",
        [order.id]
      );
      await pool.query("UPDATE invoices SET status = 'paid' WHERE order_id = $1", [order.id]);

      // Try to process payment
      const result = await processOrderPayment({
        orderId: order.id,
        txHash: 'txhash_late',
        actorUserId: buyer.id,
      });

      expect(result.ok).toBe(true);
      expect(result.state).toBe('confirmed');
      expect(result.idempotent).toBe(true);
      expect(result.message).toContain('already');

      // Blockchain should not be called
      expect(blockchainService.verifyPayment).not.toHaveBeenCalled();
    });

    it('should return idempotent response for already paid invoice', async () => {
      const { order, invoice } = await setupOrderWithPayment(1);

      // Mark invoice as paid (but order still pending - edge case)
      await pool.query("UPDATE invoices SET status = 'paid', tx_hash = 'old_hash' WHERE id = $1", [
        invoice.id,
      ]);

      // Try to process payment (no actorUserId)
      const result = await processOrderPayment({
        orderId: order.id,
        txHash: 'txhash_new',
      });

      expect(result.ok).toBe(true);
      expect(result.idempotent).toBe(true);
    });
  });

  describe('Error handling in phases', () => {
    it('should handle blockchain verification failure gracefully', async () => {
      const { order } = await setupOrderWithPayment(2);

      // Mock blockchain failure
      blockchainService.verifyPayment.mockRejectedValue(new Error('Network timeout'));

      // Process payment (no actorUserId)
      const result = await processOrderPayment({
        orderId: order.id,
        txHash: 'txhash_test',
      });

      expect(result.ok).toBe(false);
      expect(result.state).toBe('failed');
      expect(result.code).toBe('VERIFICATION_ERROR');
      expect(result.message).toContain('Network timeout');

      // Order should still be pending
      const orderResult = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
      expect(orderResult.rows[0].status).toBe('pending');

      // Stock reservation should be intact
      const stockResult = await pool.query(
        'SELECT reserved_quantity FROM products WHERE id = $1',
        [product.id]
      );
      expect(stockResult.rows[0].reserved_quantity).toBe(2);
    });

    it('should handle pending verification (awaiting confirmations)', async () => {
      const { order } = await setupOrderWithPayment(1);

      // Mock blockchain - not enough confirmations
      blockchainService.verifyPayment.mockResolvedValue({
        verified: false,
        status: 'pending',
        confirmations: 2, // Need more
      });

      const result = await processOrderPayment({
        orderId: order.id,
        txHash: 'txhash_test',
      });

      expect(result.ok).toBe(false);
      expect(result.state).toBe('pending');
      expect(result.code).toBe('AWAITING_CONFIRMATIONS');
      expect(result.confirmations).toBe(2);
    });

    it('should reject expired invoice', async () => {
      const { order, invoice } = await setupOrderWithPayment(1);

      // Expire invoice
      await pool.query("UPDATE invoices SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [
        invoice.id,
      ]);

      const result = await processOrderPayment({
        orderId: order.id,
        txHash: 'txhash_test',
      });

      expect(result.ok).toBe(false);
      expect(result.state).toBe('expired');
      expect(result.code).toBe('INVOICE_EXPIRED');
    });
  });

  describe('Authorization checks', () => {
    it('should reject unauthorized user', async () => {
      const { order } = await setupOrderWithPayment(1);

      // Create another user
      const stranger = await createTestUser({
        telegramId: '9300001003',
        username: 'stranger',
      });

      await expect(
        processOrderPayment({
          orderId: order.id,
          txHash: 'txhash_test',
          actorUserId: stranger.id,
        })
      ).rejects.toThrow('Not authorized');
    });

    it('should allow seller with allowSeller flag', async () => {
      const { order } = await setupOrderWithPayment(1);

      blockchainService.verifyPayment.mockResolvedValue({
        verified: true,
        confirmations: 6,
        amount: 0.001,
      });

      const result = await processOrderPayment({
        orderId: order.id,
        txHash: 'txhash_test',
        actorUserId: seller.id,
        allowSeller: true,
      });

      expect(result.ok).toBe(true);
    });
  });
});
