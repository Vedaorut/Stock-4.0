--
-- PostgreSQL database dump
--

-- Dumped from database version 14.17 (Homebrew)
-- Dumped by pg_dump version 14.17 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users (id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at, wallet_ltc, language) VALUES (1345, 7425261679, 'fawn00', 'Melanin', NULL, 'seller', '2025-12-02 11:50:24.43129', '2025-12-02 11:50:32.213901', NULL, 'en');
INSERT INTO public.users (id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at, wallet_ltc, language) VALUES (3, 1650141541, 'silversternev', 'Silverster', NULL, NULL, '2025-11-30 21:56:09.267292', '2025-11-30 21:56:09.267292', NULL, 'ru');
INSERT INTO public.users (id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at, wallet_ltc, language) VALUES (1, 8137738270, 'saver_hub', 'SaverHub', NULL, 'buyer', '2025-11-30 21:09:30.860882', '2025-12-01 13:05:24.818866', NULL, 'ru');
INSERT INTO public.users (id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at, wallet_ltc, language) VALUES (2062, 1910236113, 'aqGavhfVDaC', 'Ghiyath', NULL, NULL, '2025-12-02 16:09:50.489657', '2025-12-02 16:09:53.497506', NULL, 'en');
INSERT INTO public.users (id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at, wallet_ltc, language) VALUES (4, 8131073756, 'Isae_e', 'Andromeda Skyline', NULL, 'buyer', '2025-12-01 19:16:39.02033', '2025-12-01 19:16:43.356232', NULL, 'ru');
INSERT INTO public.users (id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at, wallet_ltc, language) VALUES (2, 1997815787, 'Sithil15', 'Fred Matthew Brown', NULL, 'buyer', '2025-11-30 21:11:22.547677', '2025-12-02 16:34:17.347652', NULL, 'en');


--
-- Data for Name: shops; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.shops (id, owner_id, registration_paid, name, description, logo, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, tier, is_active, created_at, updated_at, subscription_status, next_payment_due, grace_period_until, channel_url, is_trial, trial_ends_at) VALUES (4, 2, true, 'status', 'Магазин status', NULL, 'bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs', NULL, NULL, NULL, 'pro', true, '2025-11-30 21:11:36.080793', '2025-12-02 15:14:37.987514', 'active', '2025-12-30 21:11:36.084', NULL, '@golovol10', false, NULL);
INSERT INTO public.shops (id, owner_id, registration_paid, name, description, logo, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, tier, is_active, created_at, updated_at, subscription_status, next_payment_due, grace_period_until, channel_url, is_trial, trial_ends_at) VALUES (3, 1, true, 'team01', 'Магазин team01', NULL, NULL, NULL, NULL, NULL, 'pro', true, '2025-11-30 21:09:53.17581', '2025-11-30 21:09:53.178301', 'active', '2025-12-30 21:09:53.182', NULL, NULL, false, NULL);


--
-- Data for Name: channel_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.channel_migrations (id, shop_id, old_channel_url, new_channel_url, sent_count, failed_count, status, created_at, started_at, completed_at) VALUES (1, 4, NULL, '@golovol10', 1, 0, 'completed', '2025-12-02 15:14:37.033821', '2025-12-02 15:14:37.03753', '2025-12-02 15:14:37.985394');


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (1, 4, 'yelow card', NULL, 100.00000000, 'USD', 5, true, '2025-11-30 21:12:01.072864', '2025-11-30 21:12:01.072864', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (2, 4, 'yelow card', NULL, 100.00000000, 'USD', 5, true, '2025-11-30 21:12:01.088802', '2025-11-30 21:12:01.088802', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (472, 4, 'Hole', '', 100.00000000, 'USD', 5, true, '2025-12-02 15:13:30.186139', '2025-12-02 15:13:30.186139', 0, 0.00, NULL, NULL, true);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (3, 4, 'Goe', NULL, 1.00000000, 'USD', 0, true, '2025-11-30 21:38:59.34071', '2025-12-01 11:53:17.724889', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (4, 4, 'green', NULL, 1.00000000, 'USD', 9, true, '2025-12-01 12:29:26.722005', '2025-12-01 13:38:34.146922', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (14, 3, 'iPhone 15 Pro Max 256GB', 'Новый, запечатанный. Цвет: Natural Titanium', 1299.00000000, 'USD', 5, true, '2025-12-01 16:21:04.99512', '2025-12-01 16:21:04.99512', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (15, 3, 'iPhone 15 Pro 128GB', 'Новый, гарантия 1 год. Цвет: Blue Titanium', 1099.00000000, 'USD', 3, true, '2025-12-01 16:21:04.99512', '2025-12-01 16:21:04.99512', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (16, 3, 'AirPods Pro 2', 'Оригинал Apple, USB-C версия', 249.00000000, 'USD', 10, true, '2025-12-01 16:21:04.99512', '2025-12-01 16:21:04.99512', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (18, 3, 'Apple Watch Ultra 2', '49mm, титановый корпус', 799.00000000, 'USD', 4, true, '2025-12-01 16:21:04.99512', '2025-12-01 16:21:04.99512', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (19, 3, 'iPad Pro 12.9" M2', '256GB WiFi, Space Gray', 1199.00000000, 'USD', 3, true, '2025-12-01 16:21:04.99512', '2025-12-01 16:21:04.99512', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (20, 3, 'Samsung Galaxy S24 Ultra', '512GB, Titanium Black', 1199.00000000, 'USD', 6, true, '2025-12-01 16:21:04.99512', '2025-12-01 16:21:04.99512', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (21, 3, 'Sony WH-1000XM5', 'Беспроводные наушники с ANC', 349.00000000, 'USD', 8, true, '2025-12-01 16:21:04.99512', '2025-12-01 16:21:04.99512', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (23, 4, 'Adidas Yeezy Boost 350', 'Bone colorway, лимитка', 299.00000000, 'USD', 3, true, '2025-12-01 16:21:16.098639', '2025-12-01 16:21:16.098639', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (24, 4, 'New Balance 550', 'White/Green, все размеры', 129.00000000, 'USD', 8, true, '2025-12-01 16:21:16.098639', '2025-12-01 16:21:16.098639', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (25, 4, 'Jordan 4 Retro', 'Thunder colorway - предзаказ', 320.00000000, 'USD', 0, true, '2025-12-01 16:21:16.098639', '2025-12-01 16:21:16.098639', 0, 0.00, NULL, NULL, true);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (26, 4, 'Nike Dunk Low Panda', 'Классика, размеры 36-44', 119.00000000, 'USD', 15, true, '2025-12-01 16:21:16.098639', '2025-12-01 16:21:16.098639', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (27, 4, 'Asics Gel-Kayano 14', 'Silver/Black, комфорт', 179.00000000, 'USD', 6, true, '2025-12-01 16:21:16.098639', '2025-12-01 16:21:16.098639', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (28, 4, 'Nike Air Force 1', 'All White, в наличии', 99.00000000, 'USD', 20, true, '2025-12-01 16:21:16.098639', '2025-12-01 16:21:16.098639', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (29, 4, 'Jordan 1 High Travis Scott', 'Mocha - предзаказ 2 недели', 450.00000000, 'USD', 0, true, '2025-12-01 16:21:16.098639', '2025-12-01 16:21:16.098639', 0, 0.00, NULL, NULL, true);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (30, 4, 'Salomon XT-6', 'Black/Silver trail runner', 199.00000000, 'USD', 4, true, '2025-12-01 16:21:16.098639', '2025-12-01 16:21:16.098639', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (22, 4, 'Nike Air Max 90', 'Размеры: 40-45, белые', 159.00000000, 'USD', 12, true, '2025-12-01 16:21:16.098639', '2025-12-01 16:25:43.427848', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (17, 3, 'MacBook Air M3 15"', '16GB RAM, 512GB SSD, Space Gray', 1699.00000000, 'USD', 2, true, '2025-12-01 16:21:04.99512', '2025-12-01 16:25:43.431422', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (33, 4, 'AirPods Pro 2', 'Оригинал Apple, USB-C версия', 299.00000000, 'USD', 10, true, '2025-12-01 16:21:56.014232', '2025-12-01 16:45:21.066081', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (63, 4, 'Lop', '', 60.00000000, 'USD', 10, true, '2025-12-01 21:34:46.51735', '2025-12-01 21:34:51.747141', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (31, 4, 'iPhone 15 Pro Max 256GB', 'Новый, запечатанный. Цвет: Natural Titanium', 4273.71000000, 'USD', 5, true, '2025-12-01 16:21:56.014232', '2025-12-01 21:35:02.976231', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (32, 4, 'iPhone 15 Pro 128GB', 'Новый, гарантия 1 год. Цвет: Blue Titanium', 3615.71000000, 'USD', 3, true, '2025-12-01 16:21:56.014232', '2025-12-01 21:35:02.976231', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (35, 4, 'Apple Watch Ultra 2', '49mm, титановый корпус', 2628.71000000, 'USD', 4, true, '2025-12-01 16:21:56.014232', '2025-12-01 21:35:02.976231', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (36, 4, 'iPad Pro 12.9" M2', '256GB WiFi, Space Gray', 3944.71000000, 'USD', 3, true, '2025-12-01 16:21:56.014232', '2025-12-01 21:35:02.976231', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (37, 4, 'Samsung Galaxy S24 Ultra', '512GB, Titanium Black', 3944.71000000, 'USD', 6, true, '2025-12-01 16:21:56.014232', '2025-12-01 21:35:02.976231', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (38, 4, 'Sony WH-1000XM5', 'Беспроводные наушники с ANC', 1148.21000000, 'USD', 8, true, '2025-12-01 16:21:56.014232', '2025-12-01 21:35:02.976231', 0, 0.00, NULL, NULL, false);
INSERT INTO public.products (id, shop_id, name, description, price, currency, stock_quantity, is_active, created_at, updated_at, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder) VALUES (34, 4, 'MacBook Air M3 15"', '16GB RAM, 512GB SSD, Space Gray', 5589.71000000, 'USD', 2, true, '2025-12-01 16:21:56.014232', '2025-12-01 21:35:02.976231', 0, 0.00, NULL, NULL, false);


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (1, 1, 3, 1, 1.00000000, 'USD', '', 'cancelled', '2025-11-30 22:54:59.971147', '2025-11-30 23:15:37.897594', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (2, 1, 3, 1, 1.00000000, 'USD', '', 'cancelled', '2025-11-30 23:17:06.602004', '2025-11-30 23:40:37.435686', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (3, 1, 3, 3, 201.00000000, 'USD', '', 'cancelled', '2025-11-30 23:17:18.991846', '2025-11-30 23:40:37.448521', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (4, 1, 3, 1, 1.00000000, 'USD', '', 'cancelled', '2025-12-01 09:54:28.371106', '2025-12-01 10:16:06.680698', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (5, 1, 3, 1, 1.00000000, 'USD', '', 'cancelled', '2025-12-01 10:05:32.50678', '2025-12-01 10:25:59.182666', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (6, 1, 3, 1, 1.00000000, 'USD', '', 'cancelled', '2025-12-01 10:08:51.944889', '2025-12-01 10:31:21.968185', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (7, 1, 3, 1, 1.00000000, 'USD', '', 'cancelled', '2025-12-01 10:09:39.475473', '2025-12-01 10:31:21.969231', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (8, 1, 3, 1, 1.00000000, 'USD', '', 'cancelled', '2025-12-01 10:11:34.36698', '2025-12-01 10:36:21.97237', NULL, NULL, 0.00001161, 'BTC', 'bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs', NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (10, 1, 3, 1, 1.00000000, 'USD', '', 'cancelled', '2025-12-01 11:30:43.419328', '2025-12-01 11:53:17.730951', NULL, NULL, 0.00001154, 'BTC', 'bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs', NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (9, 1, 3, 1, 1.00000000, 'USD', '', 'shipped', '2025-12-01 10:17:35.014829', '2025-12-01 16:08:10.503016', '2025-12-01 11:32:53.491522', NULL, 0.00001161, 'BTC', 'bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs', 'ad7b4ad415f67a1aca39043a3d9aeb286169f19f7f0440efe8d24a7808b1755d');
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (13, 1, 4, 1, 1.00000000, 'USD', '', 'shipped', '2025-12-01 13:05:36.485096', '2025-12-01 16:08:10.503016', '2025-12-01 13:38:34.146922', NULL, 0.00001152, 'BTC', 'bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs', '9aed4cebe29f09b3169f4b12532bbbe538bfd5e19b4c98536f7cae87461a224a');
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (16, 3, 14, 1, 1299.00000000, 'USD', NULL, 'delivered', '2025-11-28 16:22:30.941801', '2025-11-29 16:22:30.941801', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (17, 3, 16, 2, 498.00000000, 'USD', NULL, 'shipped', '2025-11-26 16:22:30.941801', '2025-11-27 16:22:30.941801', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (14, 1, 22, 1, 159.00000000, 'USD', NULL, 'cancelled', '2025-12-01 14:22:30.941801', '2025-12-01 16:25:43.43074', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (18, 2, 17, 1, 1699.00000000, 'USD', NULL, 'cancelled', '2025-12-01 15:52:30.941801', '2025-12-01 16:25:43.431843', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) VALUES (15, 1, 26, 2, 238.00000000, 'USD', NULL, 'shipped', '2025-11-30 16:22:30.941801', '2025-12-01 19:18:03.490646', NULL, NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: shop_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.shop_subscriptions (id, shop_id, tier, amount, tx_hash, currency, period_start, period_end, status, created_at, verified_at, user_id) VALUES (1, 3, 'pro', 0.00, 'promo-3-1764526193183', 'USDT', '2025-11-30 21:09:53.182', '2025-12-30 21:09:53.182', 'active', '2025-11-30 21:09:53.178301', '2025-11-30 21:09:53.178301', 1);
INSERT INTO public.shop_subscriptions (id, shop_id, tier, amount, tx_hash, currency, period_start, period_end, status, created_at, verified_at, user_id) VALUES (2, 4, 'pro', 0.00, 'promo-4-1764526296084', 'USDT', '2025-11-30 21:11:36.084', '2025-12-30 21:11:36.084', 'active', '2025-11-30 21:11:36.082403', '2025-11-30 21:11:36.082403', 2);


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (1, 1, 3, 'Goe', 1, 1.00000000, 'USD', '2025-11-30 22:54:59.971147');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (2, 2, 3, 'Goe', 1, 1.00000000, 'USD', '2025-11-30 23:17:06.602004');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (3, 3, 3, 'Goe', 1, 1.00000000, 'USD', '2025-11-30 23:17:18.991846');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (4, 3, 2, 'yelow card', 1, 100.00000000, 'USD', '2025-11-30 23:17:18.991846');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (5, 3, 1, 'yelow card', 1, 100.00000000, 'USD', '2025-11-30 23:17:18.991846');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (6, 4, 3, 'Goe', 1, 1.00000000, 'USD', '2025-12-01 09:54:28.371106');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (7, 5, 3, 'Goe', 1, 1.00000000, 'USD', '2025-12-01 10:05:32.50678');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (8, 6, 3, 'Goe', 1, 1.00000000, 'USD', '2025-12-01 10:08:51.944889');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (9, 7, 3, 'Goe', 1, 1.00000000, 'USD', '2025-12-01 10:09:39.475473');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (10, 8, 3, 'Goe', 1, 1.00000000, 'USD', '2025-12-01 10:11:34.36698');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (11, 9, 3, 'Goe', 1, 1.00000000, 'USD', '2025-12-01 10:17:35.014829');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (12, 10, 3, 'Goe', 1, 1.00000000, 'USD', '2025-12-01 11:30:43.419328');
INSERT INTO public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) VALUES (13, 13, 4, 'green', 1, 1.00000000, 'USD', '2025-12-01 13:05:36.485096');


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.payments (id, order_id, tx_hash, amount, currency, status, confirmations, verified_at, created_at, updated_at, subscription_id, verification_status, last_checked_at, blockchain_confirmations, verification_error, recipient_address, expected_crypto_amount) VALUES (1, 9, 'ad7b4ad415f67a1aca39043a3d9aeb286169f19f7f0440efe8d24a7808b1755d', 1.00000000, 'BTC', 'confirmed', 0, NULL, '2025-12-01 10:19:33.627889', '2025-12-01 11:32:53.491522', NULL, 'confirmed', '2025-12-01 11:32:53.482313', 7, NULL, 'bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs', NULL);
INSERT INTO public.payments (id, order_id, tx_hash, amount, currency, status, confirmations, verified_at, created_at, updated_at, subscription_id, verification_status, last_checked_at, blockchain_confirmations, verification_error, recipient_address, expected_crypto_amount) VALUES (3, 13, '9aed4cebe29f09b3169f4b12532bbbe538bfd5e19b4c98536f7cae87461a224a', 1.00000000, 'BTC', 'confirmed', 0, NULL, '2025-12-01 13:06:43.43994', '2025-12-01 13:38:34.146922', NULL, 'confirmed', '2025-12-01 13:38:34.108151', 3, NULL, 'bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs', 0.00001152);


--
-- Data for Name: processed_webhooks; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: promo_activations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.promo_activations (id, user_id, shop_id, promo_code, activated_at) VALUES (1, 1, 3, 'team-0', '2025-11-30 21:09:53.178301');
INSERT INTO public.promo_activations (id, user_id, shop_id, promo_code, activated_at) VALUES (2, 2, 4, 'team-0', '2025-11-30 21:11:36.082403');


--
-- Data for Name: promo_codes; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.promo_codes (id, code, discount_percentage, tier, max_uses, used_count, expires_at, is_active, created_at, updated_at) VALUES (3, 'comi9999', 100.00, 'pro', NULL, 1, NULL, true, '2025-11-28 15:50:21.444015', '2025-11-29 08:13:32.699232');
INSERT INTO public.promo_codes (id, code, discount_percentage, tier, max_uses, used_count, expires_at, is_active, created_at, updated_at) VALUES (4, 'PRO', 100.00, 'pro', NULL, 0, NULL, true, '2025-11-30 12:59:29.548525', '2025-11-30 12:59:29.548525');
INSERT INTO public.promo_codes (id, code, discount_percentage, tier, max_uses, used_count, expires_at, is_active, created_at, updated_at) VALUES (2, 'team-0', 100.00, 'pro', NULL, 4, NULL, true, '2025-11-27 12:50:25.182318', '2025-11-30 21:11:36.087773');


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (1, 2, '3f47704f3ad46352f8ee0203f37484d57d7b2605f859fa6c48e385ae9d282ea8', '2026-01-01 08:40:10.395724', '2025-12-02 08:40:10.395724', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (60, 2, '5ff31eba4e576983f9c7b92867c5c705ab2f206d2e80e3477113383bb376e892', '2026-01-01 15:00:26.665449', '2025-12-02 15:00:26.665449', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (61, 2, '97715f4150077c02ab866d2a40758e5901c1e261a4608bbecfd0bd70e1a0bdbb', '2026-01-01 15:00:38.946732', '2025-12-02 15:00:38.946732', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (62, 2, '1da7b48ba9f9f39762f8229b8ae661208008025ec3631564070515b4bf69831f', '2026-01-01 15:01:03.115665', '2025-12-02 15:01:03.115665', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (63, 2, '94fc3435d012ff62adcf4f6b6bf257d54b18bc75efc54c93e73cb28904265f50', '2026-01-01 15:01:09.204062', '2025-12-02 15:01:09.204062', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (64, 2, 'aeaba0ebd00946d0131aa44dfdad20360f5ce1f7c386653c3ab582222a3655a2', '2026-01-01 15:01:18.692199', '2025-12-02 15:01:18.692199', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (65, 2, 'a8b4fb995648b1c1e64f6426ad9131c11415e6aea7491e5f72c67dd15d8861db', '2026-01-01 15:11:07.987623', '2025-12-02 15:11:07.987623', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (66, 2, '04cdf42da3eb25c3b0b74fb97c4da8ca7c00bb1bb69c8e9ba71fa04e7d90f3b8', '2026-01-01 15:13:57.980775', '2025-12-02 15:13:57.980775', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (67, 2, 'eb7e92e046f974c95307e77a3a6fc3ee8ff222de1b5fdb7a1794a2b1d2a0372b', '2026-01-01 15:27:02.578609', '2025-12-02 15:27:02.578609', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (68, 2, 'a138502f5cff5384b82b40a51740d805e93ffa048a4939d79a7e5d6ccd4853ec', '2026-01-01 15:29:20.646147', '2025-12-02 15:29:20.646147', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (69, 2, '242d372518e96a8c42076475b353c1ea6bca90e147bf2af751a9dfaeeb060b62', '2026-01-01 16:13:07.556341', '2025-12-02 16:13:07.556341', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (70, 2, '7a20a2d7de279f86df8079c4907529063df51dc5da4acca82415f8003dbb2cf1', '2026-01-01 16:20:46.752636', '2025-12-02 16:20:46.752636', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (29, 2, 'f268ded14dc4f82ad3251cbf449a73f42e9da036949f33146d3c7960d75c1ae8', '2026-01-01 11:35:16.036488', '2025-12-02 11:35:16.036488', NULL);
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES (30, 2, 'dd40ffcce51f978a8072a13d9e5541cc767d286f2f467513f833739ffa4f933e', '2026-01-01 11:55:51.516173', '2025-12-02 11:55:51.516173', NULL);


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.schema_migrations (version, name, applied_at) VALUES (16, 'add_crypto_amount_to_invoices', '2025-11-01 19:38:21.642182');
INSERT INTO public.schema_migrations (version, name, applied_at) VALUES (17, 'add_user_id_to_shop_subscriptions', '2025-11-01 20:18:08.574655');


--
-- Data for Name: shop_follows; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.shop_follows (id, follower_shop_id, source_shop_id, mode, markup_percentage, status, created_at, updated_at, markup_type, markup_fixed) VALUES (2, 4, 3, 'monitor', 0.00, 'active', '2025-12-01 16:21:42.357684', '2025-12-02 15:01:53.797827', 'percentage', 0.00000000);


--
-- Data for Name: shop_payments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: shop_workers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.subscriptions (id, user_id, shop_id, telegram_id, created_at) VALUES (1, 1, 4, 8137738270, '2025-11-30 21:12:54.433409');
INSERT INTO public.subscriptions (id, user_id, shop_id, telegram_id, created_at) VALUES (3, 3, 3, NULL, '2025-11-26 16:22:43.461274');
INSERT INTO public.subscriptions (id, user_id, shop_id, telegram_id, created_at) VALUES (4, 3, 4, NULL, '2025-11-29 16:22:43.461274');
INSERT INTO public.subscriptions (id, user_id, shop_id, telegram_id, created_at) VALUES (5, 2, 3, 1997815787, '2025-12-02 15:26:48.287108');


--
-- Data for Name: synced_products; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: channel_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.channel_migrations_id_seq', 1, true);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoices_id_seq', 146, true);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_items_id_seq', 149, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.orders_id_seq', 319, true);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payments_id_seq', 3, true);


--
-- Name: processed_webhooks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.processed_webhooks_id_seq', 49, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.products_id_seq', 518, true);


--
-- Name: promo_activations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promo_activations_id_seq', 2, true);


--
-- Name: promo_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promo_codes_id_seq', 4, true);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.refresh_tokens_id_seq', 79, true);


--
-- Name: shop_follows_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shop_follows_id_seq', 2, true);


--
-- Name: shop_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shop_payments_id_seq', 1, false);


--
-- Name: shop_subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shop_subscriptions_id_seq', 158, true);


--
-- Name: shop_workers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shop_workers_id_seq', 162, true);


--
-- Name: shops_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shops_id_seq', 1676, true);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.subscriptions_id_seq', 5, true);


--
-- Name: synced_products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.synced_products_id_seq', 8, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 2282, true);


--
-- Name: wallet_address_index_btc; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.wallet_address_index_btc', 14, true);


--
-- Name: wallet_address_index_eth; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.wallet_address_index_eth', 4, true);


--
-- Name: wallet_address_index_ltc; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.wallet_address_index_ltc', 39, true);


--
-- Name: wallet_address_index_usdt_trc20; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.wallet_address_index_usdt_trc20', 2, true);


--
-- PostgreSQL database dump complete
--

