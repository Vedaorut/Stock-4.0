import { http, HttpResponse } from 'msw';
import shopsData from '../data/shops.json';

const BASE_URL = 'http://localhost:3000';

export const shopsHandlers = [
  // GET /api/shops - list of all shops
  http.get(`${BASE_URL}/api/shops`, () => {
    return HttpResponse.json({
      success: true,
      data: shopsData.filter((s) => s.is_active),
    });
  }),

  // GET /api/shops/active - list of active shops
  http.get(`${BASE_URL}/api/shops/active`, () => {
    return HttpResponse.json({
      success: true,
      data: shopsData.filter((s) => s.is_active),
    });
  }),

  // GET /api/shops/search - search shops
  http.get(`${BASE_URL}/api/shops/search`, ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.toLowerCase() || '';

    const filtered = shopsData.filter(
      (s) =>
        s.is_active &&
        (s.name.toLowerCase().includes(query) || s.description?.toLowerCase().includes(query))
    );

    return HttpResponse.json({ success: true, data: filtered });
  }),

  // GET /api/shops/my - my shops (owner_id === 1)
  http.get(`${BASE_URL}/api/shops/my`, () => {
    const myShops = shopsData.filter((s) => s.owner_id === 1);
    return HttpResponse.json({ success: true, data: myShops });
  }),

  // GET /api/shops/:id - single shop
  http.get(`${BASE_URL}/api/shops/:id`, ({ params }) => {
    const shop = shopsData.find((s) => s.id === Number(params.id));

    if (!shop) {
      return HttpResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    return HttpResponse.json({ success: true, data: shop });
  }),

  // POST /api/shops - create shop
  http.post(`${BASE_URL}/api/shops`, async ({ request }) => {
    const body = await request.json();

    const newShop = {
      id: Math.max(...shopsData.map((s) => s.id)) + 1,
      owner_id: 1, // Mock user
      name: body.name,
      description: body.description || null,
      logo: body.logo || null,
      tier: 'FREE',
      is_active: true,
      product_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    shopsData.push(newShop);

    return HttpResponse.json({ success: true, data: newShop }, { status: 201 });
  }),

  // PUT /api/shops/:id - update shop
  http.put(`${BASE_URL}/api/shops/:id`, async ({ params, request }) => {
    const body = await request.json();
    const shopIndex = shopsData.findIndex((s) => s.id === Number(params.id));

    if (shopIndex === -1) {
      return HttpResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const shop = shopsData[shopIndex];

    // Check permissions (owner only)
    if (shop.owner_id !== 1) {
      return HttpResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Update fields
    const updatedShop = {
      ...shop,
      name: body.name !== undefined ? body.name : shop.name,
      description: body.description !== undefined ? body.description : shop.description,
      logo: body.logo !== undefined ? body.logo : shop.logo,
      updated_at: new Date().toISOString(),
    };

    shopsData[shopIndex] = updatedShop;

    return HttpResponse.json({ success: true, data: updatedShop });
  }),

  // DELETE /api/shops/:id - delete shop (soft delete)
  http.delete(`${BASE_URL}/api/shops/:id`, ({ params }) => {
    const shopIndex = shopsData.findIndex((s) => s.id === Number(params.id));

    if (shopIndex === -1) {
      return HttpResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const shop = shopsData[shopIndex];

    // Check permissions
    if (shop.owner_id !== 1) {
      return HttpResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Soft delete
    shopsData[shopIndex] = {
      ...shop,
      is_active: false,
      updated_at: new Date().toISOString(),
    };

    return HttpResponse.json({
      success: true,
      message: 'Shop deleted successfully',
    });
  }),

  // GET /api/shops/:id/wallets - shop wallets
  http.get(`${BASE_URL}/api/shops/:id/wallets`, ({ params }) => {
    const shop = shopsData.find((s) => s.id === Number(params.id));

    if (!shop) {
      return HttpResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Check permissions
    if (shop.owner_id !== 1) {
      return HttpResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Temporarily return empty wallets (synchronously)
    return HttpResponse.json({
      success: true,
      data: {
        wallet_btc: null,
        wallet_eth: null,
        wallet_usdt: null,
        wallet_ltc: null,
      },
    });
  }),

  // PUT /api/shops/:id/wallets - update wallets
  http.put(`${BASE_URL}/api/shops/:id/wallets`, async ({ params, request }) => {
    const body = await request.json();
    const shop = shopsData.find((s) => s.id === Number(params.id));

    if (!shop) {
      return HttpResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Check permissions
    if (shop.owner_id !== 1) {
      return HttpResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // In reality, this would be updated via storage
    return HttpResponse.json({
      success: true,
      data: body,
    });
  }),
];
