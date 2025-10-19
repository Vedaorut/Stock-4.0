-- ============================================
-- Test Data Seeds for Development
-- ============================================

-- Clear existing data (for re-seeding)
TRUNCATE TABLE subscriptions, order_items, orders, products, shop_payments, shops, users RESTART IDENTITY CASCADE;

-- ============================================
-- Seed Users
-- ============================================
INSERT INTO users (telegram_id, username, first_name, last_name, role, created_at) VALUES
(123456789, 'buyer_john', 'John', 'Doe', 'buyer', NOW() - INTERVAL '30 days'),
(987654321, 'seller_alice', 'Alice', 'Smith', 'seller', NOW() - INTERVAL '25 days'),
(555666777, 'seller_bob', 'Bob', 'Johnson', 'seller', NOW() - INTERVAL '20 days'),
(111222333, 'buyer_mary', 'Mary', 'Williams', 'buyer', NOW() - INTERVAL '15 days'),
(444555666, 'buyer_david', 'David', 'Brown', 'buyer', NOW() - INTERVAL '10 days');

-- ============================================
-- Seed Shops
-- ============================================
INSERT INTO shops (owner_id, name, description, wallet_btc, wallet_eth, wallet_usdt, is_active, created_at) VALUES
(2, 'Crypto Electronics Store', 'Premium electronics and gadgets for crypto',
 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
 '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
 'TRX9yDjHnPkX3yWnMgQxDgBFzYnYeFBPQh',
 true, NOW() - INTERVAL '24 days'),
(3, 'Digital Goods Hub', 'Software licenses, game keys, and digital content',
 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
 '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
 'TMuA6YqfCeX8EhbfYEg2y7xShErXWEEBvn',
 true, NOW() - INTERVAL '19 days');

-- ============================================
-- Seed Shop Payments (activation payments)
-- ============================================
INSERT INTO shop_payments (user_id, shop_id, amount, currency, payment_hash, payment_address, status, created_at, verified_at) VALUES
(2, 1, 0.00082500, 'BTC', '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'confirmed', NOW() - INTERVAL '24 days', NOW() - INTERVAL '24 days'),
(3, 2, 25.00000000, 'USDT', '0xef123456789abcdef123456789abcdef123456789abcdef123456789abcdef12',
 'TMuA6YqfCeX8EhbfYEg2y7xShErXWEEBvn', 'confirmed', NOW() - INTERVAL '19 days', NOW() - INTERVAL '19 days');

-- ============================================
-- Seed Products
-- ============================================
INSERT INTO products (shop_id, name, description, price, currency, stock_quantity, is_available, created_at) VALUES
-- Electronics Store Products
(1, 'Apple MacBook Pro 16"', 'M3 Max, 64GB RAM, 2TB SSD - Latest model', 0.07500000, 'BTC', 5, true, NOW() - INTERVAL '23 days'),
(1, 'iPhone 15 Pro Max', '256GB, Titanium Blue - Factory unlocked', 0.03200000, 'BTC', 10, true, NOW() - INTERVAL '23 days'),
(1, 'Sony WH-1000XM5 Headphones', 'Premium noise-cancelling wireless headphones', 0.00950000, 'BTC', 15, true, NOW() - INTERVAL '22 days'),
(1, 'Samsung 4K Monitor 32"', 'Ultra HD, HDR10+, 144Hz gaming monitor', 1200.00000000, 'USDT', 8, true, NOW() - INTERVAL '21 days'),
(1, 'Logitech MX Master 3S', 'Wireless productivity mouse with precision tracking', 250.00000000, 'USDT', 20, true, NOW() - INTERVAL '20 days'),

-- Digital Goods Hub Products
(2, 'Windows 11 Pro License', 'Lifetime activation key for Windows 11 Professional', 0.00420000, 'BTC', 50, true, NOW() - INTERVAL '18 days'),
(2, 'Adobe Creative Cloud', '1 Year All Apps subscription - Official license', 1500.00000000, 'USDT', 30, true, NOW() - INTERVAL '18 days'),
(2, 'Steam Gift Card $100', 'Instant delivery steam wallet code', 100.00000000, 'USDT', 100, true, NOW() - INTERVAL '17 days'),
(2, 'Microsoft Office 2024', 'Lifetime Office Professional Plus license', 0.00280000, 'BTC', 75, true, NOW() - INTERVAL '16 days'),
(2, 'Spotify Premium 12 Months', '1 year premium subscription - Private account', 350.00000000, 'USDT', 40, true, NOW() - INTERVAL '15 days'),
(2, 'VPN Premium Lifetime', 'NordVPN lifetime subscription - 6 devices', 0.01500000, 'BTC', 25, true, NOW() - INTERVAL '14 days'),
(2, 'Minecraft Java + Bedrock', 'Full game access for PC - Instant delivery', 80.00000000, 'USDT', 60, true, NOW() - INTERVAL '13 days');

-- ============================================
-- Seed Orders
-- ============================================
INSERT INTO orders (buyer_id, shop_id, total_amount, currency, payment_hash, payment_address, status, created_at, paid_at, completed_at) VALUES
-- Completed orders
(1, 1, 0.00950000, 'BTC', '0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890',
 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'completed', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '11 days'),
(4, 2, 450.00000000, 'USDT', '0x2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890ab',
 'TMuA6YqfCeX8EhbfYEg2y7xShErXWEEBvn', 'completed', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days'),

-- Paid orders (awaiting completion)
(5, 1, 1200.00000000, 'USDT', '0x3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
 'TRX9yDjHnPkX3yWnMgQxDgBFzYnYeFBPQh', 'paid', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NULL),

-- Pending orders
(1, 2, 0.00280000, 'BTC', NULL, NULL, 'pending', NOW() - INTERVAL '2 days', NULL, NULL),
(4, 1, 0.03200000, 'BTC', NULL, NULL, 'pending', NOW() - INTERVAL '1 day', NULL, NULL);

-- ============================================
-- Seed Order Items
-- ============================================
INSERT INTO order_items (order_id, product_id, product_name, quantity, price, currency) VALUES
-- Order 1 items (completed)
(1, 3, 'Sony WH-1000XM5 Headphones', 1, 0.00950000, 'BTC'),

-- Order 2 items (completed)
(2, 7, 'Adobe Creative Cloud', 1, 1500.00000000, 'USDT'),
(2, 10, 'Spotify Premium 12 Months', 1, 350.00000000, 'USDT'),

-- Order 3 items (paid)
(3, 4, 'Samsung 4K Monitor 32"', 1, 1200.00000000, 'USDT'),

-- Order 4 items (pending)
(4, 9, 'Microsoft Office 2024', 1, 0.00280000, 'BTC'),

-- Order 5 items (pending)
(5, 2, 'iPhone 15 Pro Max', 1, 0.03200000, 'BTC');

-- ============================================
-- Seed Subscriptions
-- ============================================
INSERT INTO subscriptions (user_id, shop_id, created_at) VALUES
(1, 1, NOW() - INTERVAL '11 days'),
(1, 2, NOW() - INTERVAL '9 days'),
(4, 2, NOW() - INTERVAL '8 days'),
(5, 1, NOW() - INTERVAL '4 days'),
(4, 1, NOW() - INTERVAL '3 days');

-- ============================================
-- Verify seed data
-- ============================================
-- Check row counts
SELECT 'Users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'Shops', COUNT(*) FROM shops
UNION ALL
SELECT 'Products', COUNT(*) FROM products
UNION ALL
SELECT 'Orders', COUNT(*) FROM orders
UNION ALL
SELECT 'Order Items', COUNT(*) FROM order_items
UNION ALL
SELECT 'Subscriptions', COUNT(*) FROM subscriptions
UNION ALL
SELECT 'Shop Payments', COUNT(*) FROM shop_payments;
