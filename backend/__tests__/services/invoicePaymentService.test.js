import { jest } from '@jest/globals';

// Mocks
const mockVerify = jest.fn();
const mockPaymentCreate = jest.fn();
const mockPaymentUpdate = jest.fn();
const mockOrderItems = jest.fn();
const mockUpdateStock = jest.fn();
const mockOrderFindById = jest.fn();
const mockProductFindById = jest.fn();
const mockShopFindById = jest.fn();
const mockUserFindById = jest.fn();

// Mock modules with ESM unstable_mockModule
jest.unstable_mockModule('../../src/services/paymentVerificationService.js', () => ({
  default: { verifyIncomingPayment: mockVerify },
  verifyIncomingPayment: mockVerify,
}));

jest.unstable_mockModule('../../src/database/queries/index.js', () => ({
  paymentQueries: {
    create: mockPaymentCreate,
    updateStatus: mockPaymentUpdate,
  },
  invoiceQueries: {},
  orderQueries: {
    findById: mockOrderFindById,
    updateStatus: jest.fn(),
  },
  orderItemQueries: {
    findByOrderIdWithStock: mockOrderItems,
  },
  productQueries: {
    updateStock: mockUpdateStock,
    findById: mockProductFindById,
  },
  shopQueries: {
    findById: mockShopFindById,
  },
  subscriptionQueries: {
    findShopSubscriptionById: jest.fn(async (id) => ({
      id,
      tier: 'basic',
      shop_id: 5,
      user_id: 11,
      amount: 25,
      currency: 'USDT',
      period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
    })),
  },
  userQueries: {
    findById: mockUserFindById,
  },
}));

jest.unstable_mockModule('../../src/config/database.js', () => ({
  getClient: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/telegram.js', () => ({
  default: {
    notifyPaymentConfirmed: jest.fn(),
    notifyPaymentConfirmedSeller: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const { getClient } = await import('../../src/config/database.js');
const invoicePaymentService = await import('../../src/services/invoicePaymentService.js');

describe('invoicePaymentService.processOrderPayment', () => {
  let baseOrder;
  let baseInvoice;
  let client;

  beforeEach(() => {
    jest.clearAllMocks();

    baseOrder = {
      id: 1,
      buyer_id: 10,
      owner_id: 20,
      product_id: 100,
      quantity: 1,
      status: 'pending',
      currency: 'USDT',
    };

    baseInvoice = {
      id: 7,
      order_id: 1,
      address: 'addr',
      chain: 'USDT_TRC20',
      currency: 'USDT',
      crypto_amount: '10',
      expected_amount: '10',
      status: 'pending',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };

    client = {
      queries: [],
      query: jest.fn(async (sql, params = []) => {
        client.queries.push(sql);

        if (/BEGIN/i.test(sql) || /COMMIT/i.test(sql) || /ROLLBACK/i.test(sql)) {
          return { rows: [] };
        }

        if (sql.includes('FROM orders')) {
          return { rows: [baseOrder] };
        }

        if (sql.includes('FROM invoices')) {
          return { rows: [baseInvoice] };
        }

        if (sql.includes('FROM payments')) {
          return { rows: [] };
        }

        if (sql.includes('pg_advisory_xact_lock')) {
          return { rows: [] };
        }

        if (sql.startsWith('UPDATE invoices SET status')) {
          baseInvoice.status = params[0];
          return { rows: [] };
        }

        if (sql.includes('SELECT p.stock_quantity')) {
          return {
            rows: [
              {
                stock_quantity: 5,
                is_preorder: false,
                product_name: 'Prod',
                shop_name: 'Shop',
                shop_id: 2,
              },
            ],
          };
        }

        if (sql.startsWith('SELECT is_preorder FROM products')) {
          return { rows: [{ is_preorder: false }] };
        }

        if (sql.startsWith('UPDATE orders SET status')) {
          baseOrder.status = params[0];
          return { rows: [] };
        }

        return { rows: [] };
      }),
      release: jest.fn(),
    };

    getClient.mockResolvedValue(client);

    mockPaymentCreate.mockResolvedValue({
      id: 99,
      order_id: 1,
      status: 'pending',
      tx_hash: 'hash',
      confirmations: 0,
    });

    mockPaymentUpdate.mockResolvedValue({ id: 99, status: 'confirmed' });
    mockOrderItems.mockResolvedValue([]);
    mockUpdateStock.mockResolvedValue(true);
    mockOrderFindById.mockResolvedValue({
      id: 1,
      product_id: 100,
      buyer_id: 10,
      buyer_telegram_id: 123,
      total_price: 10,
      quantity: 1,
      currency: 'USDT',
    });
    mockProductFindById.mockResolvedValue({ id: 100, name: 'Prod', shop_id: 2 });
    mockShopFindById.mockResolvedValue({ id: 2, owner_id: 20, name: 'Shop' });
    mockUserFindById.mockResolvedValue({ id: 10, telegram_id: 123, username: 'user' });
  });

  test('confirms order payment successfully', async () => {
    mockVerify.mockResolvedValue({
      verified: true,
      status: 'confirmed',
      amount: 10,
      txHash: 'hash',
      confirmations: 15,
    });

    const result = await invoicePaymentService.processOrderPayment({
      orderId: 1,
      txHash: 'hash',
      paymentLink: null,
      actorUserId: 10,
    });

    expect(result.ok).toBe(true);
    expect(result.state).toBe('confirmed');
    expect(mockPaymentCreate).toHaveBeenCalled();
    expect(mockUpdateStock).toHaveBeenCalled();
  });

  test('rejects reused tx hash for another order', async () => {
    client.query.mockImplementation(async (sql, params = []) => {
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (sql.includes('FROM orders')) return { rows: [baseOrder] };
      if (sql.includes('FROM invoices')) return { rows: [baseInvoice] };
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('FROM payments')) return { rows: [{ order_id: 999 }] };
      if (sql.startsWith('UPDATE invoices')) return { rows: [] };
      if (sql.startsWith('UPDATE orders')) return { rows: [] };
      if (sql.includes('SELECT p.stock_quantity'))
        return { rows: [{ stock_quantity: 5, is_preorder: false, product_name: 'Prod', shop_id: 2 }] };
      return { rows: [] };
    });

    await expect(
      invoicePaymentService.processOrderPayment({
        orderId: 1,
        txHash: 'hash',
        paymentLink: null,
        actorUserId: 10,
      })
    ).rejects.toThrow('This transaction was already used for another payment');
  });

  test('returns expired when invoice is past due', async () => {
    baseInvoice.expires_at = new Date(Date.now() - 1000).toISOString();

    const result = await invoicePaymentService.processOrderPayment({
      orderId: 1,
      txHash: 'hash',
      paymentLink: null,
      actorUserId: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.state).toBe('expired');
  });

  test('fails on amount mismatch', async () => {
    mockVerify.mockResolvedValue({
      verified: true,
      status: 'confirmed',
      amount: 5,
      txHash: 'hash',
      confirmations: 15,
    });

    const result = await invoicePaymentService.processOrderPayment({
      orderId: 1,
      txHash: 'hash',
      paymentLink: null,
      actorUserId: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('AMOUNT_MISMATCH');
  });
});

describe('invoicePaymentService.processSubscriptionPayment', () => {
  let client;
  let invoiceRow;

  beforeEach(() => {
    jest.clearAllMocks();

    invoiceRow = {
      id: 50,
      subscription_id: 5,
      address: 'addr',
      chain: 'USDT_TRC20',
      currency: 'USDT',
      crypto_amount: '25',
      expected_amount: '25',
      status: 'pending',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };

    client = {
      query: jest.fn(async (sql, params = []) => {
        if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
        if (sql.includes('FROM shop_subscriptions')) {
          return {
            rows: [
              {
                id: 5,
                shop_id: 7,
                tier: 'basic',
                user_id: 11,
                owner_id: 11,
                status: 'pending',
              },
            ],
          };
        }
        if (sql.includes('FROM invoices')) return { rows: [invoiceRow] };
        if (sql.includes('FROM payments')) return { rows: [] };
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };

    getClient.mockResolvedValue(client);
    mockPaymentCreate.mockResolvedValue({ id: 123, status: 'pending', tx_hash: 'hash' });
  });

  test('activates subscription when payment confirmed', async () => {
    mockVerify.mockResolvedValue({
      verified: true,
      status: 'confirmed',
      amount: 25,
      txHash: 'hash',
      confirmations: 30,
    });

    const result = await invoicePaymentService.processSubscriptionPayment({
      subscriptionId: 5,
      txHash: 'hash',
      paymentLink: null,
      actorUserId: 11,
    });

    expect(result.ok).toBe(true);
    expect(result.state).toBe('confirmed');
    expect(mockPaymentCreate).toHaveBeenCalled();
  });
});
