import { http, HttpResponse } from 'msw';
import ordersData from '../data/orders.json';
import { storage } from '../utils/storage.js';

const BASE_URL = 'http://localhost:3000';

// Mock test user telegram ID
const TEST_USER_TELEGRAM_ID = 123456789;

export const ordersHandlers = [
  // GET /api/orders - user orders (buyer by default)
  http.get(`${BASE_URL}/api/orders`, ({ request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'buyer';
    const shopId = url.searchParams.get('shop_id');

    let filtered = [...ordersData];

    if (type === 'buyer') {
      // Orders as buyer
      filtered = filtered.filter((o) => o.buyer_telegram_id === TEST_USER_TELEGRAM_ID);
    } else if (type === 'seller') {
      // Orders as seller - requires shopsData import
      if (shopId) {
        filtered = filtered.filter((o) => o.shop_id === Number(shopId));
      }
    }

    return HttpResponse.json({ success: true, data: filtered });
  }),

  // GET /api/orders/my - my orders (buyer or seller)
  http.get(`${BASE_URL}/api/orders/my`, ({ request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'buyer';
    const shopId = url.searchParams.get('shop_id');

    let filtered = [...ordersData];

    if (type === 'buyer') {
      filtered = filtered.filter((o) => o.buyer_telegram_id === TEST_USER_TELEGRAM_ID);
    } else if (type === 'seller') {
      if (shopId) {
        filtered = filtered.filter((o) => o.shop_id === Number(shopId));
      }
    }

    return HttpResponse.json({ success: true, data: filtered });
  }),

  // GET /api/orders/sales - sales (seller)
  http.get(`${BASE_URL}/api/orders/sales`, ({ request }) => {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shop_id');

    let filtered = [...ordersData];

    if (shopId) {
      filtered = filtered.filter((o) => o.shop_id === Number(shopId));
    } else {
      // All orders from my shops
      import('../data/shops.json').then((module) => {
        const myShops = module.default.filter((s) => s.owner_id === 1);
        const myShopIds = myShops.map((s) => s.id);
        filtered = filtered.filter((o) => myShopIds.includes(o.shop_id));
      });
    }

    return HttpResponse.json({ orders: filtered });
  }),

  // GET /api/orders/active/count - count of active orders
  http.get(`${BASE_URL}/api/orders/active/count`, ({ request }) => {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shop_id');

    if (!shopId) {
      return HttpResponse.json({ error: 'shop_id is required' }, { status: 400 });
    }

    const activeOrders = ordersData.filter(
      (o) => o.shop_id === Number(shopId) && o.status === 'confirmed'
    );

    return HttpResponse.json({
      success: true,
      data: { count: activeOrders.length },
    });
  }),

  // GET /api/orders/analytics - sales analytics
  http.get(`${BASE_URL}/api/orders/analytics`, ({ request }) => {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shop_id');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!shopId) {
      return HttpResponse.json({ error: 'shop_id is required' }, { status: 400 });
    }

    let filtered = ordersData.filter((o) => o.shop_id === Number(shopId));

    // Filter by dates
    if (from) {
      filtered = filtered.filter((o) => new Date(o.created_at) >= new Date(from));
    }
    if (to) {
      filtered = filtered.filter((o) => new Date(o.created_at) <= new Date(to));
    }

    // Calculate analytics
    const totalOrders = filtered.length;
    const deliveredOrders = filtered.filter((o) => o.status === 'delivered');
    const pendingOrders = filtered.filter((o) => o.status === 'pending').length;
    const completedOrders = deliveredOrders.length;
    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + o.total_price, 0);

    return HttpResponse.json({
      success: true,
      data: {
        period: { from, to },
        summary: {
          totalRevenue,
          totalOrders,
          completedOrders,
          pendingOrders,
          avgOrderValue: completedOrders > 0 ? totalRevenue / completedOrders : 0,
        },
        topProducts: [],
      },
    });
  }),

  // GET /api/orders/:id - single order
  http.get(`${BASE_URL}/api/orders/:id`, ({ params }) => {
    const order = ordersData.find((o) => o.id === Number(params.id));

    if (!order) {
      return HttpResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return HttpResponse.json({ success: true, data: order });
  }),

  // POST /api/orders - create order
  http.post(`${BASE_URL}/api/orders`, async ({ request }) => {
    const body = await request.json();

    const newOrder = {
      id: Math.max(...ordersData.map((o) => o.id)) + 1,
      shop_id: body.shop_id,
      buyer_telegram_id: TEST_USER_TELEGRAM_ID,
      buyer_username: body.buyer_username || 'test_user',
      product_id: body.product_id,
      product_name: body.product_name,
      quantity: body.quantity || 1,
      total_price: body.total_price,
      currency: body.currency || 'USD',
      payment_method: body.payment_method,
      payment_status: 'pending',
      wallet_address: body.wallet_address || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    ordersData.push(newOrder);
    storage.addOrder(newOrder);

    return HttpResponse.json({ success: true, data: newOrder }, { status: 201 });
  }),

  // PUT /api/orders/:id/status - update order status
  http.put(`${BASE_URL}/api/orders/:id/status`, async ({ params, request }) => {
    const body = await request.json();
    const orderIndex = ordersData.findIndex((o) => o.id === Number(params.id));

    if (orderIndex === -1) {
      return HttpResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = ordersData[orderIndex];

    // Valid statuses: pending, confirmed, shipped, delivered, cancelled
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(body.status)) {
      return HttpResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updatedOrder = {
      ...order,
      status: body.status,
      payment_status: body.payment_status || order.payment_status,
      updated_at: new Date().toISOString(),
    };

    ordersData[orderIndex] = updatedOrder;

    return HttpResponse.json({ success: true, data: updatedOrder });
  }),

  // POST /api/orders/bulk-status - bulk status update
  http.post(`${BASE_URL}/api/orders/bulk-status`, async ({ request }) => {
    const body = await request.json();
    const orderIds = body.order_ids || [];
    const newStatus = body.status;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return HttpResponse.json({ error: 'order_ids array is required' }, { status: 400 });
    }

    if (!newStatus) {
      return HttpResponse.json({ error: 'status is required' }, { status: 400 });
    }

    let updatedCount = 0;
    ordersData.forEach((order, index) => {
      if (orderIds.includes(order.id)) {
        ordersData[index] = {
          ...order,
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
        updatedCount++;
      }
    });

    return HttpResponse.json({
      success: true,
      data: {
        updated_count: updatedCount,
        orders: [], // Not returning details in mock
      },
    });
  }),
];
