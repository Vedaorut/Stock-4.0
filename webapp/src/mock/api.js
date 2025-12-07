/**
 * Mock API Adapter
 * Intercepts requests and returns mock data.
 */
/* eslint-disable no-console */
import { MOCK_USER, MOCK_SHOPS, MOCK_PRODUCTS, MOCK_ORDERS, MOCK_WALLETS, MOCK_SUBSCRIPTIONS, MOCK_WORKERS, MOCK_SEARCH_RESULTS } from './data';

const DELAY_MS = 300; // Simulate network lag

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockApi = {
    get: async (endpoint) => {
        await delay(DELAY_MS);
        console.log(`[MockApi] GET ${endpoint}`);

        // Shops
        if (endpoint === '/shops/my') {
            return { data: { data: [MOCK_SHOPS[0]] }, error: null };
        }
        if (endpoint === '/shops') {
            return { data: { data: MOCK_SHOPS }, error: null };
        }
        if (endpoint.startsWith('/shops/') && endpoint.endsWith('/products')) {
            const shopId = endpoint.split('/')[2];
            const products = MOCK_PRODUCTS[shopId] || [];
            return { data: { data: products }, error: null };
        }
        if (endpoint.match(/^\/shops\/[^/]+$/)) {
            const shopId = endpoint.split('/')[2];
            const shop = MOCK_SHOPS.find(s => s.id === shopId);
            return { data: { data: shop }, error: null };
        }

        // Products
        if (endpoint === '/products/my') {
            return { data: { data: MOCK_PRODUCTS['shop_1'] }, error: null };
        }

        // Wallets
        if (endpoint.match(/\/shops\/[^/]+\/wallets/)) {
            const shopId = endpoint.split('/')[2];
            const wallets = MOCK_WALLETS[shopId] || {};
            return { data: { data: wallets }, error: null };
        }

        // Orders
        if (endpoint.match(/\/shops\/[^/]+\/orders/)) {
            // Return all mock orders for simplicity in demo
            return { data: { data: MOCK_ORDERS }, error: null };
        }
        if (endpoint === '/orders/my') {
            return { data: { data: MOCK_ORDERS }, error: null };
        }

        // Products Check
        if (endpoint.includes('/products/limit-status/')) {
            return { data: { canAdd: true, tier: 'unlimited', current: 5, max: 100 }, error: null };
        }

        if (endpoint.includes('/products?shopId=')) {
            const url = new URL('http://mock' + endpoint);
            const shopId = url.searchParams.get('shopId');
            const products = MOCK_PRODUCTS[shopId] || MOCK_PRODUCTS['shop_1'] || [];
            // Fallback to shop_1 if specific shop has no mock products, just to show something
            return { data: { data: products }, error: null };
        }

        // Analytics
        if (endpoint.includes('/orders/analytics')) {
            return {
                data: {
                    success: true,
                    data: {
                        summary: {
                            totalRevenue: 15420.50,
                            completedOrders: 42,
                            avgOrderValue: 367.15
                        },
                        topProducts: [
                            { id: 1, name: 'iPhone 15 Pro', revenue: 8500, quantity: 8 },
                            { id: 2, name: 'MacBook Air', revenue: 4200, quantity: 3 },
                            { id: 3, name: 'AirPods Pro', revenue: 1200, quantity: 6 },
                            { id: 4, name: 'Adapter USB-C', revenue: 500, quantity: 20 },
                            { id: 5, name: 'Case MagSafe', revenue: 350, quantity: 15 }
                        ]
                    }
                },
                error: null
            };
        }

        // Subscription Status
        if (endpoint.includes('/subscriptions/status/')) {
            return {
                data: {
                    isActive: true,
                    tier: 'pro',
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    features: ['subscription.features.unlimited', 'subscription.features.analytics', 'subscription.features.support']
                },
                error: null
            };
        }

        // Subscription History
        if (endpoint.includes('/subscriptions/history/')) {
            return {
                data: {
                    data: [
                        { id: 1, tier: 'pro', amount: 29.99, created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
                        { id: 2, tier: 'basic', amount: 0, created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() }
                    ]
                },
                error: null
            };
        }

        // Subscription Pricing
        if (endpoint === '/subscriptions/pricing') {
            return {
                data: {
                    pro: { price: 29.99, features: ['subscription.features.unlimited', 'subscription.features.analytics', 'subscription.features.support'] },
                    max: { price: 99.99, features: ['subscription.features.allPro', 'subscription.features.manager', 'subscription.features.integrations'] }
                },
                error: null
            };
        }

        // Workspace Shops (Worker Mode)
        if (endpoint === '/shops/workspace') {
            return {
                data: {
                    data: MOCK_WORKERS
                },
                error: null
            };
        }

        // Follows - My Follows
        if (endpoint.includes('/follows/my')) {
            return {
                data: {
                    data: MOCK_SUBSCRIPTIONS.map(s => ({
                        id: s.id,
                        source_shop_id: s.shop_id,
                        source_shop_name: s.shop_name,
                        source_shop_description: 'Subscribed Shop',
                        source_products_count: 10 + Math.floor(Math.random() * 50),
                        mode: s.mode,
                        markup_percentage: s.markup_percentage
                    }))
                },
                error: null
            };
        }

        // Follows - Check Limit
        if (endpoint.includes('/follows/check-limit')) {
            return {
                data: {
                    count: MOCK_SUBSCRIPTIONS.length,
                    limit: 10,
                    remaining: 10 - MOCK_SUBSCRIPTIONS.length,
                    tier: 'pro',
                    canFollow: true,
                    reached: false
                },
                error: null
            };
        }

        // Shop Search (Follows)
        if (endpoint.includes('/shops/search')) {
            return {
                data: {
                    data: MOCK_SEARCH_RESULTS
                },
                error: null
            };
        }

        // Follows (Original basic handler replacement)
        if (endpoint.startsWith('/follows')) {
            return { data: { data: [] }, error: null };
        }

        // Buyer Subscriptions
        if (endpoint === '/users/subscriptions') {
            return {
                data: {
                    data: MOCK_SUBSCRIPTIONS.map(s => ({
                        id: s.id,
                        shop_id: s.shop_id,
                        shop_name: s.shop_name,
                        shop_description: 'Best shop for ' + s.shop_name,
                        status: 'active'
                    }))
                },
                error: null
            };
        }

        // Global Product Search (for Subscriptions tab)
        if (endpoint.includes('/products/search')) {
            const allProducts = Object.values(MOCK_PRODUCTS).flat();
            // Simple mock search: return random slice or find text
            // For demo, just return a mix of products to populate the list
            return {
                data: {
                    data: allProducts.slice(0, 10).map(p => ({
                        ...p,
                        shop_name: p.shop_id === 'shop_1' ? 'Premium Electronics' : 'Sneaker World'
                    }))
                },
                error: null
            };
        }

        // Buyer Orders
        if (endpoint === '/orders/my') {
            // Return orders where user is buyer
            return { data: { data: MOCK_ORDERS }, error: null };
        }

        // User / Auth
        if (endpoint === '/auth/me' || endpoint === '/users/me') {
            return { data: { data: MOCK_USER }, error: null };
        }

        // 404 for unknown
        console.warn(`[MockApi] 404 Not Found: ${endpoint}`);
        return { data: null, error: `Mock endpoint not found: ${endpoint}` };
    },

    post: async (endpoint, data) => {
        await delay(DELAY_MS);
        console.log(`[MockApi] POST ${endpoint}`, data);

        if (endpoint === '/products') {
            // Simulate creating product
            const newProduct = { ...data, id: Date.now(), shop_id: 'shop_1' };
            MOCK_PRODUCTS['shop_1'].push(newProduct);
            return { data: { data: newProduct }, error: null };
        }

        if (endpoint === '/feedback') {
            return { data: { success: true }, error: null };
        }

        if (endpoint === '/follows') {
            return { data: { success: true, id: Date.now() }, error: null };
        }

        return { data: { success: true }, error: null };
    },

    put: async (endpoint, data) => {
        await delay(DELAY_MS);
        console.log(`[MockApi] PUT ${endpoint}`, data);
        return { data: { success: true, updated: true }, error: null };
    },

    delete: async (endpoint) => {
        await delay(DELAY_MS);
        console.log(`[MockApi] DELETE ${endpoint}`);
        return { data: { success: true, deleted: true }, error: null };
    },

    patch: async (endpoint, data) => {
        await delay(DELAY_MS);
        console.log(`[MockApi] PATCH ${endpoint}`, data);
        return { data: { success: true }, error: null };
    }
};
