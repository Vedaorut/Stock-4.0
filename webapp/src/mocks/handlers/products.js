import { http, HttpResponse } from 'msw';
import productsData from '../data/products.json';

const BASE_URL = 'http://localhost:3000';

export const productsHandlers = [
  // GET /api/products - product list with filters
  http.get(`${BASE_URL}/api/products`, ({ request }) => {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId');
    const isActive = url.searchParams.get('isActive');

    let filtered = [...productsData];

    // Filter by shopId
    if (shopId) {
      filtered = filtered.filter((p) => p.shop_id === Number(shopId));
    }

    // Filter by isActive
    if (isActive !== null && isActive !== undefined) {
      const activeValue = isActive === 'true' || isActive === '1';
      filtered = filtered.filter((p) => p.is_active === activeValue);
    }

    return HttpResponse.json({ success: true, data: filtered });
  }),

  // GET /api/products/limit-status/:shopId - product limit status
  http.get(`${BASE_URL}/api/products/limit-status/:shopId`, ({ params }) => {
    const shopId = Number(params.shopId);
    const shopProducts = productsData.filter((p) => p.shop_id === shopId && p.is_active);

    // Limits by tier (from backend)
    const limits = {
      FREE: 10,
      PRO: 100,
      ENTERPRISE: 999999,
    };

    // Mock tier detection (alternating for example)
    const tier = shopId % 2 === 0 ? 'PRO' : 'FREE';
    const limit = limits[tier] ?? limits.FREE;

    return HttpResponse.json({
      current: shopProducts.length,
      limit,
      remaining: Math.max(limit - shopProducts.length, 0),
      canAdd: shopProducts.length < limit,
      tier,
    });
  }),

  // GET /api/products/:id - single product
  http.get(`${BASE_URL}/api/products/:id`, ({ params }) => {
    const product = productsData.find((p) => p.id === Number(params.id));

    if (!product) {
      return HttpResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return HttpResponse.json({ success: true, data: product });
  }),

  // POST /api/products - create product
  http.post(`${BASE_URL}/api/products`, async ({ request }) => {
    const body = await request.json();

    const newProduct = {
      id: Math.max(...productsData.map((p) => p.id)) + 1,
      shop_id: body.shop_id,
      name: body.name,
      description: body.description || null,
      price: body.price,
      currency: body.currency || 'USD',
      stock_quantity: body.stock_quantity || 0,
      reserved_quantity: 0,
      availability: body.availability || 'stock',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    productsData.push(newProduct);

    return HttpResponse.json({ success: true, data: newProduct }, { status: 201 });
  }),

  // PUT /api/products/:id - update product
  http.put(`${BASE_URL}/api/products/:id`, async ({ params, request }) => {
    const body = await request.json();
    const productIndex = productsData.findIndex((p) => p.id === Number(params.id));

    if (productIndex === -1) {
      return HttpResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const product = productsData[productIndex];

    // Update fields
    const updatedProduct = {
      ...product,
      name: body.name !== undefined ? body.name : product.name,
      description: body.description !== undefined ? body.description : product.description,
      price: body.price !== undefined ? body.price : product.price,
      currency: body.currency !== undefined ? body.currency : product.currency,
      stock_quantity:
        body.stock_quantity !== undefined ? body.stock_quantity : product.stock_quantity,
      availability: body.availability !== undefined ? body.availability : product.availability,
      is_active: body.is_active !== undefined ? body.is_active : product.is_active,
      updated_at: new Date().toISOString(),
    };

    productsData[productIndex] = updatedProduct;

    return HttpResponse.json({ success: true, data: updatedProduct });
  }),

  // DELETE /api/products/:id - delete product (soft delete)
  http.delete(`${BASE_URL}/api/products/:id`, ({ params }) => {
    const productIndex = productsData.findIndex((p) => p.id === Number(params.id));

    if (productIndex === -1) {
      return HttpResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Soft delete - is_active = false
    productsData[productIndex] = {
      ...productsData[productIndex],
      is_active: false,
      updated_at: new Date().toISOString(),
    };

    return HttpResponse.json({
      success: true,
      message: 'Product deleted successfully',
    });
  }),

  // POST /api/products/bulk-delete-all - delete all shop products
  http.post(`${BASE_URL}/api/products/bulk-delete-all`, async ({ request }) => {
    const body = await request.json();
    const shopId = body.shop_id;

    if (!shopId) {
      return HttpResponse.json({ error: 'shop_id is required' }, { status: 400 });
    }

    // Mark all shop products as inactive
    let deletedCount = 0;
    productsData.forEach((product, index) => {
      if (product.shop_id === shopId && product.is_active) {
        productsData[index] = {
          ...product,
          is_active: false,
          updated_at: new Date().toISOString(),
        };
        deletedCount++;
      }
    });

    return HttpResponse.json({
      success: true,
      data: {
        deletedCount: deletedCount,
        deletedProducts: [], // Not returning list in mock
      },
      message: `${deletedCount} product(s) deleted successfully`,
    });
  }),

  // POST /api/products/bulk-delete-by-ids - delete multiple products by ID
  http.post(`${BASE_URL}/api/products/bulk-delete-by-ids`, async ({ request }) => {
    const body = await request.json();
    const productIds = body.product_ids || [];

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return HttpResponse.json({ error: 'product_ids array is required' }, { status: 400 });
    }

    let deletedCount = 0;
    productsData.forEach((product, index) => {
      if (productIds.includes(product.id) && product.is_active) {
        productsData[index] = {
          ...product,
          is_active: false,
          updated_at: new Date().toISOString(),
        };
        deletedCount++;
      }
    });

    return HttpResponse.json({
      success: true,
      data: {
        deletedCount: deletedCount,
        deletedProducts: [], // Not returning list in mock
      },
      message: `${deletedCount} product(s) deleted successfully`,
    });
  }),
];
