/**
 * Mock Data for Demo Mode
 * Contains realistic data for development and testing without backend.
 */

export const MOCK_USER = {
    id: 123456789,
    username: 'demo_user',
    first_name: 'Demo',
    last_name: 'User',
    language_code: 'en',
    is_premium: true,
    role: 'seller', // Set to seller for full UI access
};

export const MOCK_SHOPS = [
    {
        id: 'shop_1',
        name: 'Premium Electronics',
        owner_id: 123456789,
        status: 'active',
        subscription_plan: 'pro',
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items_count: 18,
    },
    {
        id: 'shop_2',
        name: 'Sneaker World',
        owner_id: 987654321,
        status: 'active',
        subscription_plan: 'basic',
        items_count: 42,
    },
    {
        id: 'shop_3',
        name: 'Crypto Hardware',
        owner_id: 112233445,
        status: 'active',
        subscription_plan: 'max',
        items_count: 5,
    },
    {
        id: 'shop_4',
        name: 'Digital Assets',
        owner_id: 556677889,
        status: 'active',
        subscription_plan: 'pro',
        items_count: 120,
    }
];

export const MOCK_PRODUCTS = {
    shop_1: [
        {
            id: 101,
            name: 'iPhone 15 Pro Max Titanium Black 256GB',
            description: 'Titanium design, A17 Pro chip. The most powerful iPhone ever created.',
            price: 1199.00,
            stock: 5,
            is_preorder: false,
            shop_id: 'shop_1',
            created_at: new Date().toISOString(),
        },
        {
            id: 102,
            name: 'MacBook Pro 16" M3 Max',
            description: 'M3 Max, 36GB RAM, 1TB SSD. Extreme performance for pros.',
            price: 3499.00,
            stock: 2,
            is_preorder: false,
            shop_id: 'shop_1',
            created_at: new Date().toISOString(),
        },
        {
            id: 103,
            name: 'AirPods Pro 2 (USB-C)',
            description: 'Active Noise Cancellation, Transparency mode, and Personalized Spatial Audio.',
            price: 249.00,
            stock: 20,
            is_preorder: false,
            shop_id: 'shop_1',
            created_at: new Date().toISOString(),
        },
    ],
    shop_2: [
        { id: 201, name: 'Nike Air Jordan 1', price: 180.00, stock: 10, is_preorder: false, shop_id: 'shop_2' },
        { id: 202, name: 'Adidas Yeezy Boost 350', price: 220.00, stock: 0, is_preorder: true, shop_id: 'shop_2' },
    ],
};

export const MOCK_ORDERS = [
    {
        id: 'ord_1',
        shop_id: 'shop_1',
        product_name: 'iPhone 15 Pro Max',
        quantity: 1,
        total_price: 1199.00,
        crypto_amount: 0.0185,
        crypto_currency: 'BTC',
        status: 'pending',
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 mins ago
        buyer_username: 'crypto_buyer',
    },
    {
        id: 'ord_2',
        shop_id: 'shop_1',
        product_name: 'AirPods Pro 2',
        quantity: 2,
        total_price: 498.00,
        crypto_amount: 150.00,
        crypto_currency: 'USDT',
        status: 'confirmed', // Paid
        payment_hash: '0x123abc...def456',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        buyer_username: 'Anonymous',
    },
    {
        id: 'ord_3',
        shop_id: 'shop_1',
        product_name: 'MacBook Pro 16"',
        quantity: 1,
        total_price: 3499.00,
        status: 'shipped', // Issued
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        buyer_username: 'apple_fan',
    },
    {
        id: 'ord_4',
        shop_id: 'shop_1',
        product_name: 'Sony WH-1000XM5',
        quantity: 1,
        total_price: 348.00,
        status: 'cancelled',
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 2 days ago
        buyer_username: 'music_lover',
    },
    {
        id: 'ord_5',
        shop_id: 'shop_1',
        product_name: 'PS5 Slim',
        quantity: 1,
        total_price: 499.00,
        status: 'delivered', // Completed
        created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), // 3 days ago
        buyer_username: 'gamer_pro',
    }
];

export const MOCK_WALLETS = {
    shop_1: {
        btc: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        eth: '0x742d35Cc6634C0532925a3b844Bc7e759f42bE1',
        usdt: 'TMuA6YqfCeX8EhbfYEg5y7S4DqzSJjtHC1',
        ltc: null,
        updated_at: new Date().toISOString(),
    },
};

export const MOCK_SUBSCRIPTIONS = [
    {
        id: 'sub_1',
        shop_id: 'shop_2',
        shop_name: 'Sneaker World',
        user_id: 123456789,
        status: 'active',
        mode: 'monitor',
    },
    {
        id: 'sub_2',
        shop_id: 'shop_3',
        shop_name: 'Crypto Hardware',
        user_id: 123456789,
        status: 'active',
        mode: 'resell',
        markup_percentage: 15,
    },
    {
        id: 'sub_3',
        shop_id: 'shop_4',
        shop_name: 'Digital Assets',
        user_id: 123456789,
        status: 'active',
        mode: 'monitor',
    },
    {
        id: 'sub_4',
        shop_id: 'shop_5',
        shop_name: 'Fashion Hub',
        user_id: 123456789,
        status: 'active',
        mode: 'monitor',
    },
    {
        id: 'sub_5',
        shop_id: 'shop_6',
        shop_name: 'Gamer Zone',
        user_id: 123456789,
        status: 'active',
        mode: 'monitor',
    },
    {
        id: 'sub_6',
        shop_id: 'shop_7',
        shop_name: 'Luxury Watches',
        user_id: 123456789,
        status: 'active',
        mode: 'resell',
        markup_percentage: 20,
    },
    {
        id: 'sub_7',
        shop_id: 'shop_8',
        shop_name: 'Rare Collectibles',
        user_id: 123456789,
        status: 'active',
        mode: 'monitor',
    },
    {
        id: 'sub_8',
        shop_id: 'shop_9',
        shop_name: 'Auto Parts Pro',
        user_id: 123456789,
        status: 'active',
        mode: 'monitor',
    },
    {
        id: 'sub_9',
        shop_id: 'shop_10',
        shop_name: 'Organic Foods',
        user_id: 123456789,
        status: 'active',
        mode: 'monitor',
    },
    {
        id: 'sub_10',
        shop_id: 'shop_11',
        shop_name: 'Tech Gadgets',
        user_id: 123456789,
        status: 'active',
        mode: 'resell',
        markup_percentage: 10,
    }
];

export const MOCK_WORKERS = [
    {
        id: 'w_1',
        user_id: 111,
        username: 'alex_manager',
        first_name: 'Alex',
        shop_id: 'shop_1',
        role: 'admin',
        joined_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
        id: 'w_2',
        user_id: 222,
        username: 'sarah_support',
        first_name: 'Sarah',
        shop_id: 'shop_1',
        role: 'editor',
        joined_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
        id: 'w_3',
        user_id: 333,
        username: 'mike_packer',
        first_name: 'Mike',
        shop_id: 'shop_1',
        role: 'viewer',
        joined_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    }
];

// Mock Shop Search Results
export const MOCK_SEARCH_RESULTS = [
    { id: 'shop_2', name: 'Sneaker World', description: 'Best kicks in town', subscribers: 1200 },
    { id: 'shop_3', name: 'Crypto Hardware', description: 'Wallets & Miners', subscribers: 500 },
    { id: 'shop_4', name: 'Digital Assets', description: 'Accounts & Keys', subscribers: 3000 },
    { id: 'shop_5', name: 'Fashion Hub', description: 'Luxury Clothing', subscribers: 850 },
    { id: 'shop_6', name: 'Gamer Zone', description: 'Consoles & Games', subscribers: 2100 },
];

