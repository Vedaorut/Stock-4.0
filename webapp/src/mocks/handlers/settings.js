import { http, HttpResponse } from 'msw';
import walletsData from '../data/wallets.json';
import workersData from '../data/workers.json';
import { storage } from '../utils/storage.js';

const BASE_URL = 'http://localhost:3000';

export const settingsHandlers = [
  // ===== WALLETS =====

  // GET /api/wallets/:shopId - shop wallets
  http.get(`${BASE_URL}/api/wallets/:shopId`, ({ params }) => {
    const shopId = Number(params.shopId);
    const wallets = walletsData.filter((w) => w.shop_id === shopId && w.is_active);

    return HttpResponse.json({ success: true, data: wallets });
  }),

  // PUT /api/wallets/:shopId - update shop wallets
  http.put(`${BASE_URL}/api/wallets/:shopId`, async ({ params, request }) => {
    const body = await request.json();
    const shopId = Number(params.shopId);

    // In reality, this would be updated via storage
    // For now, return what was sent
    const updatedWallets = body.wallets || [];

    return HttpResponse.json({
      success: true,
      data: { shopId, wallets: updatedWallets },
      message: 'Wallets updated successfully',
    });
  }),

  // PATCH /api/wallets/:shopId - update wallets (alias for PUT)
  http.patch(`${BASE_URL}/api/wallets/:shopId`, async ({ params, request }) => {
    const body = await request.json();
    const shopId = Number(params.shopId);

    const updatedWallets = body.wallets || [];

    return HttpResponse.json({
      success: true,
      data: { shopId, wallets: updatedWallets },
      message: 'Wallets updated successfully',
    });
  }),

  // POST /api/wallets - add wallet (if separate endpoint needed)
  http.post(`${BASE_URL}/api/wallets`, async ({ request }) => {
    const body = await request.json();

    const newWallet = {
      id: Math.max(...walletsData.map((w) => w.id)) + 1,
      shop_id: body.shop_id,
      currency: body.currency,
      address: body.address,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    walletsData.push(newWallet);
    storage.addWallet(newWallet);

    return HttpResponse.json({ success: true, data: newWallet }, { status: 201 });
  }),

  // DELETE /api/wallets/:id - delete wallet
  http.delete(`${BASE_URL}/api/wallets/:id`, ({ params }) => {
    const walletIndex = walletsData.findIndex((w) => w.id === Number(params.id));

    if (walletIndex === -1) {
      return HttpResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    const wallet = walletsData[walletIndex];

    // Soft delete
    walletsData[walletIndex] = {
      ...wallet,
      is_active: false,
      updated_at: new Date().toISOString(),
    };

    storage.removeWallet(wallet.address);

    return HttpResponse.json({
      success: true,
      message: 'Wallet deleted successfully',
    });
  }),

  // ===== WORKERS =====

  // GET /api/workers - shop workers
  http.get(`${BASE_URL}/api/workers`, ({ request }) => {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId') || url.searchParams.get('shop_id');

    if (!shopId) {
      return HttpResponse.json({ error: 'shopId is required' }, { status: 400 });
    }

    const workers = workersData.filter((w) => w.shop_id === Number(shopId));

    return HttpResponse.json({ success: true, data: workers });
  }),

  // POST /api/workers - add worker
  http.post(`${BASE_URL}/api/workers`, async ({ request }) => {
    const body = await request.json();

    const newWorker = {
      id: Math.max(...workersData.map((w) => w.id), 0) + 1,
      shop_id: body.shop_id,
      telegram_id: body.telegram_id,
      username: body.username || null,
      first_name: body.first_name || null,
      role: body.role || 'worker',
      permissions: body.permissions || ['view_products', 'manage_products', 'view_orders'],
      is_active: true,
      invited_by: 1, // Mock user
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    workersData.push(newWorker);
    storage.addWorker(newWorker);

    return HttpResponse.json({ success: true, data: newWorker }, { status: 201 });
  }),

  // PUT /api/workers/:id - update worker
  http.put(`${BASE_URL}/api/workers/:id`, async ({ params, request }) => {
    const body = await request.json();
    const workerIndex = workersData.findIndex((w) => w.id === Number(params.id));

    if (workerIndex === -1) {
      return HttpResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    const worker = workersData[workerIndex];

    const updatedWorker = {
      ...worker,
      role: body.role !== undefined ? body.role : worker.role,
      permissions: body.permissions !== undefined ? body.permissions : worker.permissions,
      is_active: body.is_active !== undefined ? body.is_active : worker.is_active,
      updated_at: new Date().toISOString(),
    };

    workersData[workerIndex] = updatedWorker;

    return HttpResponse.json({ success: true, data: updatedWorker });
  }),

  // DELETE /api/workers/:id - delete worker
  http.delete(`${BASE_URL}/api/workers/:id`, ({ params }) => {
    const workerIndex = workersData.findIndex((w) => w.id === Number(params.id));

    if (workerIndex === -1) {
      return HttpResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    // Delete worker (hard delete in this case)
    const worker = workersData[workerIndex];
    workersData.splice(workerIndex, 1);
    storage.removeWorker(worker.id);

    return HttpResponse.json({
      success: true,
      message: 'Worker removed successfully',
    });
  }),
];
