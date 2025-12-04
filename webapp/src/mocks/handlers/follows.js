import { http, HttpResponse } from 'msw';
import followsData from '../data/follows.json';
import syncedProductsData from '../data/synced_products.json';
import productsData from '../data/products.json';
import shopsData from '../data/shops.json';
import { storage } from '../utils/storage.js';

const BASE_URL = 'http://localhost:3000';

export const followsHandlers = [
  // GET /api/follows - my follows
  http.get(`${BASE_URL}/api/follows`, ({ request }) => {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId') || url.searchParams.get('shop_id');

    let filtered = [...followsData];

    if (shopId) {
      filtered = filtered.filter((f) => f.follower_shop_id === Number(shopId));
    } else {
      // All follows from my shops (owner_id === 1)
      const myShops = shopsData.filter((s) => s.owner_id === 1);
      const myShopIds = myShops.map((s) => s.id);
      filtered = filtered.filter((f) => myShopIds.includes(f.follower_shop_id));
    }

    return HttpResponse.json({ data: filtered });
  }),

  // GET /api/follows/my - my follows (alias)
  http.get(`${BASE_URL}/api/follows/my`, ({ request }) => {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId') || url.searchParams.get('shop_id');

    let filtered = [...followsData];

    if (shopId) {
      filtered = filtered.filter((f) => f.follower_shop_id === Number(shopId));
    }

    return HttpResponse.json({ data: filtered });
  }),

  // GET /api/follows/check-limit - check follows limit
  http.get(`${BASE_URL}/api/follows/check-limit`, ({ request }) => {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId') || url.searchParams.get('shop_id');

    if (!shopId) {
      return HttpResponse.json({ error: 'shopId is required' }, { status: 400 });
    }

    const currentFollows = followsData.filter(
      (f) => f.follower_shop_id === Number(shopId) && f.status === 'active'
    );

    // Limits by tier
    const limits = {
      FREE: 3,
      PRO: 10,
      ENTERPRISE: 50,
    };

    // Get shop tier
    const shop = shopsData.find((s) => s.id === Number(shopId));
    const tier = shop?.tier || 'FREE';
    const limit = limits[tier];

    return HttpResponse.json({
      data: {
        limit: limit,
        count: currentFollows.length,
        remaining: currentFollows.length < limit ? limit - currentFollows.length : 0,
        reached: currentFollows.length >= limit,
        canFollow: currentFollows.length < limit,
        tier: tier,
      },
    });
  }),

  // GET /api/follows/:id - single follow
  http.get(`${BASE_URL}/api/follows/:id`, ({ params }) => {
    const follow = followsData.find((f) => f.id === Number(params.id));

    if (!follow) {
      return HttpResponse.json({ error: 'Follow not found' }, { status: 404 });
    }

    return HttpResponse.json({ data: follow });
  }),

  // GET /api/follows/:id/products - follow products
  http.get(`${BASE_URL}/api/follows/:id/products`, ({ params }) => {
    const follow = followsData.find((f) => f.id === Number(params.id));

    if (!follow) {
      return HttpResponse.json({ error: 'Follow not found' }, { status: 404 });
    }

    let products = [];

    if (follow.mode === 'monitor') {
      // Monitor mode - return source products
      products = productsData.filter((p) => p.shop_id === follow.source_shop_id && p.is_active);
    } else if (follow.mode === 'resell') {
      // Resell mode - return synced products with markup
      const syncedForThisFollow = syncedProductsData.filter(
        (sp) => sp.follow_id === Number(params.id)
      );

      products = syncedForThisFollow.map((sp) => ({
        ...sp,
        source_product: sp.source_product,
        synced_product: sp.synced_product,
        conflict_status: sp.conflict_status,
        last_synced_at: sp.last_synced_at,
      }));
    }

    return HttpResponse.json({
      data: {
        mode: follow.mode,
        products,
        pagination: {
          limit: 25,
          offset: 0,
          total: products.length,
        },
      },
    });
  }),

  // POST /api/follows - create follow
  http.post(`${BASE_URL}/api/follows`, async ({ request }) => {
    const body = await request.json();

    const newFollow = {
      id: Math.max(...followsData.map((f) => f.id)) + 1,
      follower_shop_id: body.follower_shop_id,
      source_shop_id: body.source_shop_id,
      mode: body.mode || 'monitor',
      markup_percentage: body.markup_percentage || 0,
      status: 'active',
      synced_products_count: 0,
      source_products_count: 0, // Will be populated from products
      source_shop_name: body.source_shop_name || 'Unknown Shop',
      source_shop_logo: body.source_shop_logo || null,
      follower_shop_name: body.follower_shop_name || 'My Shop',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    followsData.push(newFollow);

    return HttpResponse.json({ data: newFollow }, { status: 201 });
  }),

  // PUT /api/follows/:id - update follow (general)
  http.put(`${BASE_URL}/api/follows/:id`, async ({ params, request }) => {
    const body = await request.json();
    const followIndex = followsData.findIndex((f) => f.id === Number(params.id));

    if (followIndex === -1) {
      return HttpResponse.json({ error: 'Follow not found' }, { status: 404 });
    }

    const follow = followsData[followIndex];

    const updatedFollow = {
      ...follow,
      mode: body.mode !== undefined ? body.mode : follow.mode,
      markup_percentage:
        body.markup_percentage !== undefined ? body.markup_percentage : follow.markup_percentage,
      status: body.status !== undefined ? body.status : follow.status,
      updated_at: new Date().toISOString(),
    };

    followsData[followIndex] = updatedFollow;
    storage.updateFollow(updatedFollow);

    return HttpResponse.json({ data: updatedFollow });
  }),

  // PUT /api/follows/:id/markup - update markup
  http.put(`${BASE_URL}/api/follows/:id/markup`, async ({ params, request }) => {
    const body = await request.json();
    const followIndex = followsData.findIndex((f) => f.id === Number(params.id));

    if (followIndex === -1) {
      return HttpResponse.json({ error: 'Follow not found' }, { status: 404 });
    }

    const follow = followsData[followIndex];

    const updatedFollow = {
      ...follow,
      markup_percentage: body.markup_percentage,
      updated_at: new Date().toISOString(),
    };

    followsData[followIndex] = updatedFollow;
    storage.updateFollow(updatedFollow);

    return HttpResponse.json({ data: updatedFollow });
  }),

  // PUT /api/follows/:id/mode - switch mode
  http.put(`${BASE_URL}/api/follows/:id/mode`, async ({ params, request }) => {
    const body = await request.json();
    const followIndex = followsData.findIndex((f) => f.id === Number(params.id));

    if (followIndex === -1) {
      return HttpResponse.json({ error: 'Follow not found' }, { status: 404 });
    }

    const follow = followsData[followIndex];

    // Mode validation
    if (!['monitor', 'resell'].includes(body.mode)) {
      return HttpResponse.json(
        { error: 'Invalid mode. Use "monitor" or "resell"' },
        { status: 400 }
      );
    }

    const updatedFollow = {
      ...follow,
      mode: body.mode,
      updated_at: new Date().toISOString(),
    };

    followsData[followIndex] = updatedFollow;
    storage.updateFollow(updatedFollow);

    return HttpResponse.json({ data: updatedFollow });
  }),

  // DELETE /api/follows/:id - delete follow
  http.delete(`${BASE_URL}/api/follows/:id`, ({ params }) => {
    const followIndex = followsData.findIndex((f) => f.id === Number(params.id));

    if (followIndex === -1) {
      return HttpResponse.json({ error: 'Follow not found' }, { status: 404 });
    }

    // Delete follow
    followsData.splice(followIndex, 1);
    storage.deleteFollowById(Number(params.id));

    return HttpResponse.json({
      data: { id: Number(params.id), deleted: true },
    });
  }),

  // GET /api/shop-follows - alias for /api/follows/my
  http.get(`${BASE_URL}/api/shop-follows`, ({ request }) => {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shop_id');

    let filtered = followsData.filter((f) => f.follower_shop_id === (shopId ? Number(shopId) : 1));

    return HttpResponse.json({ data: filtered });
  }),
];
