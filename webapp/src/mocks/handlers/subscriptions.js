import { http, HttpResponse } from 'msw';
import followsData from '../data/follows.json';

const BASE_URL = 'http://localhost:3000';

export const subscriptionsHandlers = [
  // GET /api/subscriptions - alias for /api/follows/my
  http.get(`${BASE_URL}/api/subscriptions`, ({ request }) => {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shop_id');

    let filtered = followsData.filter((f) => f.follower_shop_id === (shopId ? Number(shopId) : 1));
    return HttpResponse.json({ success: true, data: filtered });
  }),

  // GET /api/subscriptions/status/:shopId - subscription tier info
  http.get(`${BASE_URL}/api/subscriptions/status/:shopId`, ({ params }) => {
    const shopId = Number(params.shopId);
    const activeFollows = followsData.filter(
      (f) => f.follower_shop_id === shopId && f.status === 'active'
    ).length;

    // Mock tier limits (from backend logic)
    const tiers = {
      FREE: { maxFollows: 3, maxProducts: 10 },
      PRO: { maxFollows: 10, maxProducts: 100 },
      ENTERPRISE: { maxFollows: 50, maxProducts: 999999 },
    };

    return HttpResponse.json({
      success: true,
      data: {
        currentTier: 'PRO',
        activeFollows,
        limits: tiers.PRO,
      },
    });
  }),

  // GET /api/subscriptions/history/:shopId - change history
  http.get(`${BASE_URL}/api/subscriptions/history/:shopId`, ({ request, params }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit')) || 10;

    // Mock history data
    const history = [
      {
        id: 1,
        shop_id: Number(params.shopId),
        action: 'follow_created',
        details: { follow_id: 1, source_shop: 'Fashion Store' },
        created_at: '2024-10-25T10:00:00Z',
      },
      {
        id: 2,
        shop_id: Number(params.shopId),
        action: 'markup_changed',
        details: { follow_id: 1, old_markup: 15, new_markup: 25 },
        created_at: '2024-10-26T14:30:00Z',
      },
    ];

    return HttpResponse.json({ success: true, data: history.slice(0, limit) });
  }),

  // GET /api/subscriptions/pricing - pricing tiers
  http.get(`${BASE_URL}/api/subscriptions/pricing`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          name: 'FREE',
          price: 0,
          limits: { maxFollows: 3, maxProducts: 10 },
        },
        {
          name: 'PRO',
          price: 9.99,
          limits: { maxFollows: 10, maxProducts: 100 },
        },
        {
          name: 'ENTERPRISE',
          price: 49.99,
          limits: { maxFollows: 50, maxProducts: 999999 },
        },
      ],
    });
  }),
];
