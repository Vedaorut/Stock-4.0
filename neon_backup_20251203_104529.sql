--
-- PostgreSQL database dump
--

\restrict f8lca9HYIR7kh5PnUISQ4Le1scJrSAtn4sMGp64Lf8kLPAWilXPmwuh5D1vHaXM

-- Dumped from database version 17.6 (0d47993)
-- Dumped by pg_dump version 17.7 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: pg_session_jwt; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_session_jwt WITH SCHEMA public;


--
-- Name: EXTENSION pg_session_jwt; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_session_jwt IS 'pg_session_jwt: manage authentication sessions using JWTs';


--
-- Name: neon_auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA neon_auth;


--
-- Name: pgrst; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgrst;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: pre_config(); Type: FUNCTION; Schema: pgrst; Owner: -
--

CREATE FUNCTION pgrst.pre_config() RETURNS void
    LANGUAGE sql
    AS $$
  SELECT
      set_config('pgrst.db_schemas', 'public', true)
    , set_config('pgrst.db_aggregates_enabled', 'true', true)
    , set_config('pgrst.db_anon_role', 'anonymous', true)
    , set_config('pgrst.jwt_role_claim_key', '.role', true)
$$;


--
-- Name: check_source_not_copy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_source_not_copy() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM synced_products
    WHERE synced_product_id = NEW.source_product_id
  ) THEN
    RAISE EXCEPTION 'Cannot sync product %: it is already a synced copy (chain copying not allowed)',
      NEW.source_product_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_promo_codes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_promo_codes_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users_sync; Type: TABLE; Schema: neon_auth; Owner: -
--

CREATE TABLE neon_auth.users_sync (
    raw_json jsonb NOT NULL,
    id text GENERATED ALWAYS AS ((raw_json ->> 'id'::text)) STORED NOT NULL,
    name text GENERATED ALWAYS AS ((raw_json ->> 'display_name'::text)) STORED,
    email text GENERATED ALWAYS AS ((raw_json ->> 'primary_email'::text)) STORED,
    created_at timestamp with time zone GENERATED ALWAYS AS (to_timestamp((trunc((((raw_json ->> 'signed_up_at_millis'::text))::bigint)::double precision) / (1000)::double precision))) STORED,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: channel_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_migrations (
    id integer NOT NULL,
    shop_id integer NOT NULL,
    old_channel_url text,
    new_channel_url text NOT NULL,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    CONSTRAINT channel_migrations_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: channel_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.channel_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: channel_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.channel_migrations_id_seq OWNED BY public.channel_migrations.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    order_id integer,
    chain character varying(10) NOT NULL,
    address character varying(255),
    address_index integer,
    expected_amount numeric(18,8) NOT NULL,
    currency character varying(10) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    tatum_subscription_id character varying(255),
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    paid_at timestamp with time zone,
    tx_hash character varying(255) DEFAULT NULL::character varying,
    crystalpay_id character varying(255),
    subscription_id integer,
    CONSTRAINT check_chain_address_consistency CHECK (((((chain)::text = 'CRYSTALPAY'::text) AND (address IS NULL) AND (address_index IS NULL)) OR (((chain)::text <> 'CRYSTALPAY'::text) AND (address IS NOT NULL) AND (address_index IS NOT NULL)))),
    CONSTRAINT invoices_chain_check CHECK (((chain)::text = ANY (ARRAY[('BTC'::character varying)::text, ('ETH'::character varying)::text, ('LTC'::character varying)::text, ('USDT_TRC20'::character varying)::text, ('CRYSTALPAY'::character varying)::text]))),
    CONSTRAINT invoices_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('paid'::character varying)::text, ('expired'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: COLUMN invoices.chain; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.chain IS 'Blockchain: BTC, ETH, LTC, USDT_TRC20 (TRON only)';


--
-- Name: COLUMN invoices.paid_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.paid_at IS 'Timestamp when payment was confirmed (blockchain)';


--
-- Name: COLUMN invoices.tx_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.tx_hash IS 'Blockchain transaction hash';


--
-- Name: COLUMN invoices.crystalpay_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.crystalpay_id IS 'CrystalPay external invoice ID';


--
-- Name: CONSTRAINT check_chain_address_consistency ON invoices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT check_chain_address_consistency ON public.invoices IS 'CrystalPay invoices have no address, HD wallet invoices require address';


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer,
    product_name character varying(255) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    price numeric(18,8) NOT NULL,
    currency character varying(10) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_items_price_check CHECK ((price > (0)::numeric)),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: TABLE order_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.order_items IS 'Stores individual items in each order';


--
-- Name: COLUMN order_items.product_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_items.product_name IS 'Cached product name (in case product is deleted)';


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    buyer_id integer,
    product_id integer,
    quantity integer DEFAULT 1 NOT NULL,
    total_price numeric(18,8) NOT NULL,
    currency character varying(10) NOT NULL,
    delivery_address character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    paid_at timestamp without time zone,
    completed_at timestamp without time zone,
    crypto_amount numeric(20,8),
    crypto_currency character varying(10),
    payment_address character varying(100),
    payment_hash character varying(100),
    CONSTRAINT orders_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT orders_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text, ('shipped'::character varying)::text, ('delivered'::character varying)::text, ('cancelled'::character varying)::text, ('expired'::character varying)::text]))),
    CONSTRAINT orders_total_price_check CHECK ((total_price > (0)::numeric))
);


--
-- Name: TABLE orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.orders IS 'Stores customer orders';


--
-- Name: COLUMN orders.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.status IS 'Order status: pending, confirmed, shipped, delivered, cancelled';


--
-- Name: COLUMN orders.crypto_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.crypto_amount IS 'Amount in cryptocurrency';


--
-- Name: COLUMN orders.crypto_currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.crypto_currency IS 'Selected cryptocurrency (BTC, ETH, LTC, USDT_TRC20)';


--
-- Name: COLUMN orders.payment_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.payment_address IS 'Seller wallet address assigned for this order payment';


--
-- Name: COLUMN orders.payment_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.payment_hash IS 'Buyer transaction hash submitted after payment';


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    order_id integer,
    subscription_id integer,
    tx_hash character varying(255) NOT NULL,
    amount numeric(18,8) NOT NULL,
    currency character varying(10) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    confirmations integer DEFAULT 0,
    verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    verification_status character varying(20) DEFAULT 'pending'::character varying,
    last_checked_at timestamp without time zone,
    blockchain_confirmations integer DEFAULT 0,
    verification_error character varying(255),
    recipient_address character varying(255),
    expected_crypto_amount numeric(20,8),
    CONSTRAINT payments_currency_check CHECK (((currency)::text = ANY (ARRAY[('BTC'::character varying)::text, ('ETH'::character varying)::text, ('USDT'::character varying)::text, ('LTC'::character varying)::text, ('USDT_TRC20'::character varying)::text]))),
    CONSTRAINT payments_order_or_subscription_check CHECK ((((order_id IS NOT NULL) AND (subscription_id IS NULL)) OR ((order_id IS NULL) AND (subscription_id IS NOT NULL)))),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('confirmed'::character varying)::text, ('failed'::character varying)::text]))),
    CONSTRAINT payments_verification_status_check CHECK (((verification_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('verifying'::character varying)::text, ('confirmed'::character varying)::text, ('failed'::character varying)::text, ('expired'::character varying)::text])))
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: processed_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_webhooks (
    id integer NOT NULL,
    webhook_id character varying(255) NOT NULL,
    source character varying(50) NOT NULL,
    tx_hash character varying(255) NOT NULL,
    processed_at timestamp without time zone DEFAULT now(),
    payload jsonb,
    CONSTRAINT processed_webhooks_source_check CHECK (((source)::text = ANY (ARRAY[('blockcypher'::character varying)::text, ('etherscan'::character varying)::text, ('trongrid'::character varying)::text])))
);


--
-- Name: processed_webhooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.processed_webhooks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: processed_webhooks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.processed_webhooks_id_seq OWNED BY public.processed_webhooks.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    shop_id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    price numeric(18,8) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    reserved_quantity integer DEFAULT 0 NOT NULL,
    discount_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    original_price numeric(18,8),
    discount_expires_at timestamp without time zone,
    is_preorder boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_available_stock CHECK ((stock_quantity >= reserved_quantity)),
    CONSTRAINT check_reserved_quantity CHECK ((stock_quantity >= reserved_quantity)),
    CONSTRAINT products_discount_percentage_check CHECK (((discount_percentage >= (0)::numeric) AND (discount_percentage <= (100)::numeric))),
    CONSTRAINT products_price_check CHECK ((price > (0)::numeric)),
    CONSTRAINT products_reserved_quantity_check CHECK ((reserved_quantity >= 0)),
    CONSTRAINT products_stock_quantity_check CHECK ((stock_quantity >= 0))
);


--
-- Name: TABLE products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.products IS 'Stores products for each shop';


--
-- Name: COLUMN products.price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.price IS 'Product price in USD (8 decimal precision)';


--
-- Name: COLUMN products.currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.currency IS 'Legacy field - products are priced in USD only';


--
-- Name: COLUMN products.stock_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.stock_quantity IS 'Total stock quantity';


--
-- Name: COLUMN products.reserved_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.reserved_quantity IS 'Reserved stock for pending orders (decreased after payment confirmation)';


--
-- Name: COLUMN products.discount_percentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.discount_percentage IS 'Discount percentage (0-100). 0 = no discount';


--
-- Name: COLUMN products.original_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.original_price IS 'Original price before discount. NULL if no discount applied';


--
-- Name: COLUMN products.discount_expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.discount_expires_at IS 'When discount expires. NULL = permanent discount';


--
-- Name: COLUMN products.is_preorder; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.is_preorder IS 'Indicates if product is available for preorder only (not in stock yet)';


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: products_with_availability; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.products_with_availability AS
 SELECT id,
    shop_id,
    name,
    description,
    price,
    currency,
    stock_quantity,
    reserved_quantity,
    discount_percentage,
    original_price,
    discount_expires_at,
    is_preorder,
    is_active,
    created_at,
    updated_at,
    (stock_quantity - reserved_quantity) AS available_quantity
   FROM public.products p;


--
-- Name: VIEW products_with_availability; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.products_with_availability IS 'Convenience view showing products with calculated available_quantity field (stock_quantity - reserved_quantity)';


--
-- Name: promo_activations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_activations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    shop_id integer NOT NULL,
    promo_code character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    activated_at timestamp without time zone DEFAULT now()
);


--
-- Name: TABLE promo_activations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.promo_activations IS 'Tracks promo code activations to prevent duplicate usage';


--
-- Name: COLUMN promo_activations.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promo_activations.user_id IS 'User who activated the promo code';


--
-- Name: COLUMN promo_activations.shop_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promo_activations.shop_id IS 'Shop created with promo code';


--
-- Name: COLUMN promo_activations.promo_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promo_activations.promo_code IS 'Promo code used (e.g., comi9999)';


--
-- Name: promo_activations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promo_activations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promo_activations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promo_activations_id_seq OWNED BY public.promo_activations.id;


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    discount_percentage numeric(5,2) NOT NULL,
    tier character varying(10) NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0,
    expires_at timestamp without time zone,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT check_max_uses CHECK (((max_uses IS NULL) OR (max_uses > 0))),
    CONSTRAINT check_used_count_limit CHECK (((max_uses IS NULL) OR (used_count <= max_uses))),
    CONSTRAINT promo_codes_discount_percentage_check CHECK (((discount_percentage >= (0)::numeric) AND (discount_percentage <= (100)::numeric))),
    CONSTRAINT promo_codes_tier_check CHECK (((tier)::text = ANY (ARRAY[('basic'::character varying)::text, ('pro'::character varying)::text]))),
    CONSTRAINT promo_codes_used_count_check CHECK ((used_count >= 0))
);


--
-- Name: TABLE promo_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.promo_codes IS 'Database-driven promo codes for subscription discounts';


--
-- Name: COLUMN promo_codes.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promo_codes.code IS 'Promo code string (case-insensitive)';


--
-- Name: COLUMN promo_codes.discount_percentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promo_codes.discount_percentage IS 'Discount percentage (0-100)';


--
-- Name: COLUMN promo_codes.tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promo_codes.tier IS 'Which tier this promo applies to: basic or pro';


--
-- Name: COLUMN promo_codes.max_uses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promo_codes.max_uses IS 'Maximum number of uses. NULL = unlimited';


--
-- Name: COLUMN promo_codes.used_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promo_codes.used_count IS 'Current usage count';


--
-- Name: COLUMN promo_codes.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promo_codes.expires_at IS 'Expiration timestamp. NULL = never expires';


--
-- Name: COLUMN promo_codes.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promo_codes.is_active IS 'Whether promo code is currently active';


--
-- Name: promo_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promo_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promo_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promo_codes_id_seq OWNED BY public.promo_codes.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    revoked_at timestamp without time zone
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.refresh_tokens IS 'Stores refresh tokens for JWT rotation and session management';


--
-- Name: COLUMN refresh_tokens.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.token_hash IS 'SHA-256 hash of the actual token (never store raw tokens)';


--
-- Name: COLUMN refresh_tokens.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.expires_at IS 'Token expiration time in UTC';


--
-- Name: COLUMN refresh_tokens.revoked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.revoked_at IS 'Timestamp when token was explicitly revoked (logout, password change)';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    migration_name character varying(255) NOT NULL,
    applied_at timestamp without time zone DEFAULT now(),
    version character varying(255)
);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;


--
-- Name: shop_follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_follows (
    id integer NOT NULL,
    follower_shop_id integer NOT NULL,
    source_shop_id integer NOT NULL,
    mode character varying(20) NOT NULL,
    markup_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    markup_type character varying(10) DEFAULT 'percentage'::character varying,
    markup_fixed numeric(18,8) DEFAULT 0,
    CONSTRAINT shop_follows_check CHECK ((follower_shop_id <> source_shop_id)),
    CONSTRAINT shop_follows_markup_percentage_check CHECK (((markup_percentage >= (0)::numeric) OR (markup_percentage IS NULL))),
    CONSTRAINT shop_follows_markup_type_check CHECK (((markup_type)::text = ANY (ARRAY[('percentage'::character varying)::text, ('fixed'::character varying)::text]))),
    CONSTRAINT shop_follows_mode_check CHECK (((mode)::text = ANY (ARRAY[('monitor'::character varying)::text, ('resell'::character varying)::text]))),
    CONSTRAINT shop_follows_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('paused'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: TABLE shop_follows; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shop_follows IS 'Tracks follower→source shop relationships for dropshipping/reseller functionality';


--
-- Name: COLUMN shop_follows.mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shop_follows.mode IS 'monitor: just watch, resell: auto-copy with markup';


--
-- Name: COLUMN shop_follows.markup_percentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shop_follows.markup_percentage IS 'Markup percentage for resell mode (0.1-200%) - P1-SEC-007';


--
-- Name: shop_follows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shop_follows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shop_follows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shop_follows_id_seq OWNED BY public.shop_follows.id;


--
-- Name: shop_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_payments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    shop_id integer,
    amount numeric(18,8) NOT NULL,
    currency character varying(10) NOT NULL,
    payment_hash character varying(255),
    payment_address character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    verified_at timestamp without time zone,
    CONSTRAINT shop_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT shop_payments_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: shop_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shop_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shop_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shop_payments_id_seq OWNED BY public.shop_payments.id;


--
-- Name: shop_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_subscriptions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    shop_id integer,
    tier character varying(20) NOT NULL,
    amount numeric(10,2) NOT NULL,
    tx_hash character varying(255) NOT NULL,
    currency character varying(10) NOT NULL,
    period_start timestamp without time zone NOT NULL,
    period_end timestamp without time zone NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    verified_at timestamp without time zone,
    CONSTRAINT check_subscription_period CHECK ((period_end > period_start)),
    CONSTRAINT shop_subscriptions_currency_check CHECK (((currency)::text = ANY (ARRAY[('BTC'::character varying)::text, ('ETH'::character varying)::text, ('USDT'::character varying)::text, ('LTC'::character varying)::text]))),
    CONSTRAINT shop_subscriptions_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('pending'::character varying)::text, ('expired'::character varying)::text, ('cancelled'::character varying)::text, ('paid'::character varying)::text]))),
    CONSTRAINT shop_subscriptions_tier_check CHECK (((tier)::text = ANY (ARRAY[('basic'::character varying)::text, ('pro'::character varying)::text])))
);


--
-- Name: TABLE shop_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shop_subscriptions IS 'Stores monthly subscription payments for shops (basic $25/mo, pro $35/mo)';


--
-- Name: COLUMN shop_subscriptions.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shop_subscriptions.user_id IS 'User who created subscription (before shop is created)';


--
-- Name: COLUMN shop_subscriptions.shop_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shop_subscriptions.shop_id IS 'Shop associated with subscription (NULL until payment confirmed)';


--
-- Name: COLUMN shop_subscriptions.tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shop_subscriptions.tier IS 'Subscription tier: basic ($25, 4 products max) or pro ($35, unlimited)';


--
-- Name: COLUMN shop_subscriptions.amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shop_subscriptions.amount IS 'Payment amount in USD';


--
-- Name: COLUMN shop_subscriptions.tx_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shop_subscriptions.tx_hash IS 'Blockchain transaction hash for verification';


--
-- Name: COLUMN shop_subscriptions.period_start; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shop_subscriptions.period_start IS 'Start date of subscription period';


--
-- Name: COLUMN shop_subscriptions.period_end; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shop_subscriptions.period_end IS 'End date of subscription period (30 days from start)';


--
-- Name: COLUMN shop_subscriptions.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shop_subscriptions.status IS 'pending: awaiting confirmation, active: valid, expired: period ended, cancelled: refunded';


--
-- Name: shop_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shop_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shop_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shop_subscriptions_id_seq OWNED BY public.shop_subscriptions.id;


--
-- Name: shop_workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_workers (
    id integer NOT NULL,
    shop_id integer NOT NULL,
    worker_user_id integer NOT NULL,
    telegram_id bigint NOT NULL,
    added_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    notification_muted boolean DEFAULT false
);


--
-- Name: shop_workers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shop_workers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shop_workers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shop_workers_id_seq OWNED BY public.shop_workers.id;


--
-- Name: shops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shops (
    id integer NOT NULL,
    owner_id integer NOT NULL,
    registration_paid boolean DEFAULT false,
    name character varying(255) NOT NULL,
    description text,
    logo text,
    wallet_btc character varying(255),
    wallet_eth character varying(255),
    wallet_usdt character varying(255),
    wallet_ltc character varying(255),
    channel_url character varying(255),
    tier character varying(20) DEFAULT 'basic'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    subscription_status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    next_payment_due timestamp without time zone,
    grace_period_until timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    is_trial boolean DEFAULT false,
    trial_ends_at timestamp without time zone,
    CONSTRAINT shops_subscription_status_check CHECK (((subscription_status)::text = ANY (ARRAY[('active'::character varying)::text, ('pending'::character varying)::text, ('grace_period'::character varying)::text, ('inactive'::character varying)::text]))),
    CONSTRAINT shops_tier_check CHECK (((tier)::text = ANY (ARRAY[('basic'::character varying)::text, ('pro'::character varying)::text])))
);


--
-- Name: TABLE shops; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shops IS 'Stores shops - any user with a shop becomes a seller';


--
-- Name: COLUMN shops.owner_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shops.owner_id IS 'Reference to shop owner (user becomes seller by creating shop)';


--
-- Name: COLUMN shops.registration_paid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shops.registration_paid IS 'Whether initial subscription payment was confirmed';


--
-- Name: COLUMN shops.channel_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shops.channel_url IS 'Telegram channel URL for shop notifications (format: @channel_name or https://t.me/channel_name)';


--
-- Name: COLUMN shops.tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shops.tier IS 'Subscription tier: basic ($25/month, limited features) or pro ($35/month, workspace + unlimited follows)';


--
-- Name: COLUMN shops.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shops.is_active IS 'Shop activation status (deactivated after grace period expires)';


--
-- Name: COLUMN shops.subscription_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shops.subscription_status IS 'Subscription status: active (paid), pending (awaiting payment), grace_period (overdue but still active), inactive (expired)';


--
-- Name: COLUMN shops.next_payment_due; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shops.next_payment_due IS 'Next monthly subscription payment due date';


--
-- Name: COLUMN shops.grace_period_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shops.grace_period_until IS 'Grace period end date (2 days after payment due)';


--
-- Name: COLUMN shops.is_trial; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shops.is_trial IS 'True if shop is on free trial period';


--
-- Name: COLUMN shops.trial_ends_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shops.trial_ends_at IS 'When the free trial expires';


--
-- Name: shops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shops_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shops_id_seq OWNED BY public.shops.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    shop_id integer NOT NULL,
    telegram_id bigint,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: TABLE subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.subscriptions IS 'Stores user subscriptions to shops for notifications';


--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.subscriptions.id;


--
-- Name: synced_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.synced_products (
    id integer NOT NULL,
    follow_id integer NOT NULL,
    synced_product_id integer NOT NULL,
    source_product_id integer NOT NULL,
    last_synced_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    conflict_status character varying(20) DEFAULT 'synced'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    custom_markup_type character varying(20) DEFAULT NULL::character varying,
    custom_markup_percentage numeric(5,2) DEFAULT NULL::numeric,
    custom_markup_fixed numeric(10,2) DEFAULT NULL::numeric,
    CONSTRAINT synced_products_check CHECK ((synced_product_id <> source_product_id)),
    CONSTRAINT synced_products_conflict_status_check CHECK (((conflict_status)::text = ANY (ARRAY[('synced'::character varying)::text, ('conflict'::character varying)::text, ('manual_override'::character varying)::text]))),
    CONSTRAINT synced_products_custom_markup_fixed_check CHECK (((custom_markup_fixed IS NULL) OR ((custom_markup_fixed >= (0)::numeric) AND (custom_markup_fixed <= (10000)::numeric)))),
    CONSTRAINT synced_products_custom_markup_percentage_check CHECK (((custom_markup_percentage IS NULL) OR ((custom_markup_percentage >= (0)::numeric) AND (custom_markup_percentage <= (500)::numeric)))),
    CONSTRAINT synced_products_custom_markup_type_check CHECK (((custom_markup_type IS NULL) OR ((custom_markup_type)::text = ANY (ARRAY[('percentage'::character varying)::text, ('fixed'::character varying)::text]))))
);


--
-- Name: TABLE synced_products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.synced_products IS 'Tracks synced products between follower and source shops';


--
-- Name: COLUMN synced_products.conflict_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.synced_products.conflict_status IS 'synced: in sync, conflict: manual edits detected, manual_override: user kept manual edits';


--
-- Name: COLUMN synced_products.custom_markup_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.synced_products.custom_markup_type IS 'Custom markup type for this product. NULL = use follow global markup';


--
-- Name: COLUMN synced_products.custom_markup_percentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.synced_products.custom_markup_percentage IS 'Custom percentage markup (0-500%). NULL = use follow global';


--
-- Name: COLUMN synced_products.custom_markup_fixed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.synced_products.custom_markup_fixed IS 'Custom fixed markup ($0-$10000). NULL = use follow global';


--
-- Name: synced_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.synced_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: synced_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.synced_products_id_seq OWNED BY public.synced_products.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    telegram_id bigint NOT NULL,
    username character varying(255),
    first_name character varying(255),
    last_name character varying(255),
    selected_role character varying(20),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    language character varying(5) DEFAULT 'ru'::character varying,
    wallet_ltc character varying(100),
    CONSTRAINT users_language_check CHECK (((language)::text = ANY (ARRAY[('ru'::character varying)::text, ('en'::character varying)::text]))),
    CONSTRAINT users_selected_role_check CHECK (((selected_role)::text = ANY (ARRAY[('buyer'::character varying)::text, ('seller'::character varying)::text])))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.users IS 'Stores all platform users';


--
-- Name: COLUMN users.telegram_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.telegram_id IS 'Unique Telegram user ID';


--
-- Name: COLUMN users.language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.language IS 'User preferred language for notifications (ru, en)';


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: wallet_address_index_btc; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_address_index_btc
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: SEQUENCE wallet_address_index_btc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON SEQUENCE public.wallet_address_index_btc IS 'Atomic counter for BTC wallet address derivation index';


--
-- Name: wallet_address_index_eth; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_address_index_eth
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: SEQUENCE wallet_address_index_eth; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON SEQUENCE public.wallet_address_index_eth IS 'Atomic counter for ETH wallet address derivation index';


--
-- Name: wallet_address_index_ltc; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_address_index_ltc
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: SEQUENCE wallet_address_index_ltc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON SEQUENCE public.wallet_address_index_ltc IS 'Atomic counter for LTC wallet address derivation index';


--
-- Name: wallet_address_index_usdt_trc20; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_address_index_usdt_trc20
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: SEQUENCE wallet_address_index_usdt_trc20; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON SEQUENCE public.wallet_address_index_usdt_trc20 IS 'Atomic counter for USDT (TRC-20) wallet address derivation index';


--
-- Name: channel_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_migrations ALTER COLUMN id SET DEFAULT nextval('public.channel_migrations_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: processed_webhooks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_webhooks ALTER COLUMN id SET DEFAULT nextval('public.processed_webhooks_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: promo_activations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_activations ALTER COLUMN id SET DEFAULT nextval('public.promo_activations_id_seq'::regclass);


--
-- Name: promo_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes ALTER COLUMN id SET DEFAULT nextval('public.promo_codes_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('public.schema_migrations_id_seq'::regclass);


--
-- Name: shop_follows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_follows ALTER COLUMN id SET DEFAULT nextval('public.shop_follows_id_seq'::regclass);


--
-- Name: shop_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_payments ALTER COLUMN id SET DEFAULT nextval('public.shop_payments_id_seq'::regclass);


--
-- Name: shop_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.shop_subscriptions_id_seq'::regclass);


--
-- Name: shop_workers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_workers ALTER COLUMN id SET DEFAULT nextval('public.shop_workers_id_seq'::regclass);


--
-- Name: shops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops ALTER COLUMN id SET DEFAULT nextval('public.shops_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: synced_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_products ALTER COLUMN id SET DEFAULT nextval('public.synced_products_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: users_sync; Type: TABLE DATA; Schema: neon_auth; Owner: -
--

COPY neon_auth.users_sync (raw_json, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: channel_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.channel_migrations (id, shop_id, old_channel_url, new_channel_url, sent_count, failed_count, status, created_at, started_at, completed_at) FROM stdin;
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoices (id, order_id, chain, address, address_index, expected_amount, currency, status, tatum_subscription_id, expires_at, created_at, updated_at, paid_at, tx_hash, crystalpay_id, subscription_id) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_items (id, order_id, product_id, product_name, quantity, price, currency, created_at) FROM stdin;
5	3	\N	yelow card	1	100.00000000	USD	2025-11-30 23:17:18.991846
4	3	\N	yelow card	1	100.00000000	USD	2025-11-30 23:17:18.991846
1	1	\N	Goe	1	1.00000000	USD	2025-11-30 22:54:59.971147
2	2	\N	Goe	1	1.00000000	USD	2025-11-30 23:17:06.602004
3	3	\N	Goe	1	1.00000000	USD	2025-11-30 23:17:18.991846
6	4	\N	Goe	1	1.00000000	USD	2025-12-01 09:54:28.371106
7	5	\N	Goe	1	1.00000000	USD	2025-12-01 10:05:32.50678
8	6	\N	Goe	1	1.00000000	USD	2025-12-01 10:08:51.944889
9	7	\N	Goe	1	1.00000000	USD	2025-12-01 10:09:39.475473
10	8	\N	Goe	1	1.00000000	USD	2025-12-01 10:11:34.36698
11	9	\N	Goe	1	1.00000000	USD	2025-12-01 10:17:35.014829
12	10	\N	Goe	1	1.00000000	USD	2025-12-01 11:30:43.419328
13	13	\N	green	1	1.00000000	USD	2025-12-01 13:05:36.485096
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, buyer_id, product_id, quantity, total_price, currency, delivery_address, status, created_at, updated_at, paid_at, completed_at, crypto_amount, crypto_currency, payment_address, payment_hash) FROM stdin;
16	3	14	1	1299.00000000	USD	\N	delivered	2025-11-28 16:22:30.941801	2025-11-29 16:22:30.941801	\N	\N	\N	\N	\N	\N
17	3	16	2	498.00000000	USD	\N	shipped	2025-11-26 16:22:30.941801	2025-11-27 16:22:30.941801	\N	\N	\N	\N	\N	\N
18	\N	17	1	1699.00000000	USD	\N	cancelled	2025-12-01 15:52:30.941801	2025-12-02 20:38:13.327669	\N	\N	\N	\N	\N	\N
1	1	\N	1	1.00000000	USD		cancelled	2025-11-30 22:54:59.971147	2025-12-02 20:38:13.327669	\N	\N	\N	\N	\N	\N
2	1	\N	1	1.00000000	USD		cancelled	2025-11-30 23:17:06.602004	2025-12-02 20:38:13.327669	\N	\N	\N	\N	\N	\N
3	1	\N	3	201.00000000	USD		cancelled	2025-11-30 23:17:18.991846	2025-12-02 20:38:13.327669	\N	\N	\N	\N	\N	\N
4	1	\N	1	1.00000000	USD		cancelled	2025-12-01 09:54:28.371106	2025-12-02 20:38:13.327669	\N	\N	\N	\N	\N	\N
5	1	\N	1	1.00000000	USD		cancelled	2025-12-01 10:05:32.50678	2025-12-02 20:38:13.327669	\N	\N	\N	\N	\N	\N
6	1	\N	1	1.00000000	USD		cancelled	2025-12-01 10:08:51.944889	2025-12-02 20:38:13.327669	\N	\N	\N	\N	\N	\N
7	1	\N	1	1.00000000	USD		cancelled	2025-12-01 10:09:39.475473	2025-12-02 20:38:13.327669	\N	\N	\N	\N	\N	\N
8	1	\N	1	1.00000000	USD		cancelled	2025-12-01 10:11:34.36698	2025-12-02 20:38:13.327669	\N	\N	0.00001161	BTC	bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs	\N
10	1	\N	1	1.00000000	USD		cancelled	2025-12-01 11:30:43.419328	2025-12-02 20:38:13.327669	\N	\N	0.00001154	BTC	bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs	\N
9	1	\N	1	1.00000000	USD		shipped	2025-12-01 10:17:35.014829	2025-12-02 20:38:13.327669	2025-12-01 11:32:53.491522	\N	0.00001161	BTC	bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs	ad7b4ad415f67a1aca39043a3d9aeb286169f19f7f0440efe8d24a7808b1755d
13	1	\N	1	1.00000000	USD		shipped	2025-12-01 13:05:36.485096	2025-12-02 20:38:13.327669	2025-12-01 13:38:34.146922	\N	0.00001152	BTC	bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs	9aed4cebe29f09b3169f4b12532bbbe538bfd5e19b4c98536f7cae87461a224a
15	1	\N	2	238.00000000	USD	\N	shipped	2025-11-30 16:22:30.941801	2025-12-02 20:38:13.327669	\N	\N	\N	\N	\N	\N
14	1	\N	1	159.00000000	USD	\N	cancelled	2025-12-01 14:22:30.941801	2025-12-02 20:38:13.327669	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, order_id, subscription_id, tx_hash, amount, currency, status, confirmations, verified_at, created_at, updated_at, verification_status, last_checked_at, blockchain_confirmations, verification_error, recipient_address, expected_crypto_amount) FROM stdin;
1	9	\N	ad7b4ad415f67a1aca39043a3d9aeb286169f19f7f0440efe8d24a7808b1755d	1.00000000	BTC	confirmed	0	\N	2025-12-01 10:19:33.627889	2025-12-01 11:32:53.491522	confirmed	2025-12-01 11:32:53.482313	7	\N	bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs	\N
3	13	\N	9aed4cebe29f09b3169f4b12532bbbe538bfd5e19b4c98536f7cae87461a224a	1.00000000	BTC	confirmed	0	\N	2025-12-01 13:06:43.43994	2025-12-01 13:38:34.146922	confirmed	2025-12-01 13:38:34.108151	3	\N	bc1quer40pfhyzz2j8v32xah9zc3y0gyrj6derqtqs	0.00001152
\.


--
-- Data for Name: processed_webhooks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.processed_webhooks (id, webhook_id, source, tx_hash, processed_at, payload) FROM stdin;
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, shop_id, name, description, price, currency, stock_quantity, reserved_quantity, discount_percentage, original_price, discount_expires_at, is_preorder, is_active, created_at, updated_at) FROM stdin;
14	3	iPhone 15 Pro Max 256GB	Новый, запечатанный. Цвет: Natural Titanium	1299.00000000	USD	5	0	0.00	\N	\N	f	t	2025-12-01 16:21:04.99512	2025-12-01 16:21:04.99512
15	3	iPhone 15 Pro 128GB	Новый, гарантия 1 год. Цвет: Blue Titanium	1099.00000000	USD	3	0	0.00	\N	\N	f	t	2025-12-01 16:21:04.99512	2025-12-01 16:21:04.99512
16	3	AirPods Pro 2	Оригинал Apple, USB-C версия	249.00000000	USD	10	0	0.00	\N	\N	f	t	2025-12-01 16:21:04.99512	2025-12-01 16:21:04.99512
18	3	Apple Watch Ultra 2	49mm, титановый корпус	799.00000000	USD	4	0	0.00	\N	\N	f	t	2025-12-01 16:21:04.99512	2025-12-01 16:21:04.99512
19	3	iPad Pro 12.9" M2	256GB WiFi, Space Gray	1199.00000000	USD	3	0	0.00	\N	\N	f	t	2025-12-01 16:21:04.99512	2025-12-01 16:21:04.99512
20	3	Samsung Galaxy S24 Ultra	512GB, Titanium Black	1199.00000000	USD	6	0	0.00	\N	\N	f	t	2025-12-01 16:21:04.99512	2025-12-01 16:21:04.99512
21	3	Sony WH-1000XM5	Беспроводные наушники с ANC	349.00000000	USD	8	0	0.00	\N	\N	f	t	2025-12-01 16:21:04.99512	2025-12-01 16:21:04.99512
17	3	MacBook Air M3 15"	16GB RAM, 512GB SSD, Space Gray	1699.00000000	USD	2	0	0.00	\N	\N	f	t	2025-12-01 16:21:04.99512	2025-12-01 16:25:43.431422
\.


--
-- Data for Name: promo_activations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.promo_activations (id, user_id, shop_id, promo_code, created_at, activated_at) FROM stdin;
1	1	3	team-0	2025-12-02 14:10:55.206032	2025-11-30 21:09:53.178301
\.


--
-- Data for Name: promo_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.promo_codes (id, code, discount_percentage, tier, max_uses, used_count, expires_at, is_active, created_at, updated_at) FROM stdin;
1	comi9999	25.00	pro	\N	0	\N	t	2025-12-02 14:04:47.489682	2025-12-02 14:04:47.489682
4	PRO	100.00	pro	\N	0	\N	t	2025-11-30 12:59:29.548525	2025-11-30 12:59:29.548525
2	team-0	100.00	pro	\N	4	\N	t	2025-11-27 12:50:25.182318	2025-11-30 21:11:36.087773
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at) FROM stdin;
127	1	663db373ae90ad03e6a8ceb5435b356ae50a0be950f45037cbe7b6aebcd4765a	2026-01-01 19:32:44.22398	2025-12-02 19:32:44.22398	\N
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schema_migrations (id, migration_name, applied_at, version) FROM stdin;
1	add_hd_wallet_payment_system	2025-12-02 14:05:25.694891	\N
2	add_expired_status	2025-12-02 14:05:28.641305	\N
\.


--
-- Data for Name: shop_follows; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_follows (id, follower_shop_id, source_shop_id, mode, markup_percentage, status, created_at, updated_at, markup_type, markup_fixed) FROM stdin;
\.


--
-- Data for Name: shop_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_payments (id, user_id, shop_id, amount, currency, payment_hash, payment_address, status, created_at, verified_at) FROM stdin;
\.


--
-- Data for Name: shop_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_subscriptions (id, user_id, shop_id, tier, amount, tx_hash, currency, period_start, period_end, status, created_at, verified_at) FROM stdin;
1	1	3	pro	0.00	promo-3-1764526193183	USDT	2025-11-30 21:09:53.182	2025-12-30 21:09:53.182	active	2025-11-30 21:09:53.178301	2025-11-30 21:09:53.178301
\.


--
-- Data for Name: shop_workers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shop_workers (id, shop_id, worker_user_id, telegram_id, added_by, created_at, updated_at, notification_muted) FROM stdin;
\.


--
-- Data for Name: shops; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shops (id, owner_id, registration_paid, name, description, logo, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, channel_url, tier, is_active, subscription_status, next_payment_due, grace_period_until, created_at, updated_at, is_trial, trial_ends_at) FROM stdin;
3	1	t	team01	Магазин team01	\N	\N	\N	\N	\N	\N	pro	t	active	2025-12-30 21:09:53.182	\N	2025-11-30 21:09:53.17581	2025-11-30 21:09:53.178301	f	\N
2136	4311	f	HOlo	Магазин HOlo	\N	\N	\N	\N	\N	\N	pro	t	active	2025-12-09 20:39:49.918111	\N	2025-12-02 20:39:49.918111	2025-12-02 20:39:49.918111	t	2025-12-09 20:39:49.918111
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscriptions (id, user_id, shop_id, telegram_id, created_at) FROM stdin;
3	3	3	\N	2025-11-26 16:22:43.461274
\.


--
-- Data for Name: synced_products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.synced_products (id, follow_id, synced_product_id, source_product_id, last_synced_at, conflict_status, created_at, custom_markup_type, custom_markup_percentage, custom_markup_fixed) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at, language, wallet_ltc) FROM stdin;
1345	7425261679	fawn00	Melanin	\N	seller	2025-12-02 11:50:24.43129	2025-12-02 11:50:32.213901	en	\N
3	1650141541	silversternev	Silverster	\N	\N	2025-11-30 21:56:09.267292	2025-11-30 21:56:09.267292	ru	\N
2062	1910236113	aqGavhfVDaC	Ghiyath	\N	\N	2025-12-02 16:09:50.489657	2025-12-02 16:09:53.497506	en	\N
4	8131073756	Isae_e	Andromeda Skyline	\N	buyer	2025-12-01 19:16:39.02033	2025-12-01 19:16:43.356232	ru	\N
1	8137738270	saver_hub	SaverHub	\N	seller	2025-11-30 21:09:30.860882	2025-12-02 19:32:44.003798	en	\N
4311	1997815787	Sithil15	Fred Matthew Brown	\N	seller	2025-12-02 20:39:12.382139	2025-12-03 07:21:28.836718	ru	\N
\.


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

SELECT pg_catalog.setval('public.order_items_id_seq', 220, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.orders_id_seq', 153, true);


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

SELECT pg_catalog.setval('public.products_id_seq', 1051, true);


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

SELECT pg_catalog.setval('public.refresh_tokens_id_seq', 131, true);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.schema_migrations_id_seq', 2, true);


--
-- Name: shop_follows_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shop_follows_id_seq', 244, true);


--
-- Name: shop_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shop_payments_id_seq', 1, false);


--
-- Name: shop_subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shop_subscriptions_id_seq', 246, true);


--
-- Name: shop_workers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shop_workers_id_seq', 334, true);


--
-- Name: shops_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shops_id_seq', 2136, true);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.subscriptions_id_seq', 5, true);


--
-- Name: synced_products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.synced_products_id_seq', 20, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 4311, true);


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
-- Name: users_sync users_sync_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: -
--

ALTER TABLE ONLY neon_auth.users_sync
    ADD CONSTRAINT users_sync_pkey PRIMARY KEY (id);


--
-- Name: channel_migrations channel_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_migrations
    ADD CONSTRAINT channel_migrations_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: processed_webhooks processed_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_webhooks
    ADD CONSTRAINT processed_webhooks_pkey PRIMARY KEY (id);


--
-- Name: processed_webhooks processed_webhooks_webhook_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_webhooks
    ADD CONSTRAINT processed_webhooks_webhook_id_key UNIQUE (webhook_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: promo_activations promo_activations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_activations
    ADD CONSTRAINT promo_activations_pkey PRIMARY KEY (id);


--
-- Name: promo_activations promo_activations_user_id_promo_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_activations
    ADD CONSTRAINT promo_activations_user_id_promo_code_key UNIQUE (user_id, promo_code);


--
-- Name: promo_codes promo_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_key UNIQUE (code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: schema_migrations schema_migrations_migration_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_migration_name_key UNIQUE (migration_name);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: shop_follows shop_follows_follower_shop_id_source_shop_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_follows
    ADD CONSTRAINT shop_follows_follower_shop_id_source_shop_id_key UNIQUE (follower_shop_id, source_shop_id);


--
-- Name: shop_follows shop_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_follows
    ADD CONSTRAINT shop_follows_pkey PRIMARY KEY (id);


--
-- Name: shop_payments shop_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_payments
    ADD CONSTRAINT shop_payments_pkey PRIMARY KEY (id);


--
-- Name: shop_subscriptions shop_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_subscriptions
    ADD CONSTRAINT shop_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: shop_subscriptions shop_subscriptions_tx_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_subscriptions
    ADD CONSTRAINT shop_subscriptions_tx_hash_key UNIQUE (tx_hash);


--
-- Name: shop_workers shop_workers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_workers
    ADD CONSTRAINT shop_workers_pkey PRIMARY KEY (id);


--
-- Name: shop_workers shop_workers_shop_id_worker_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_workers
    ADD CONSTRAINT shop_workers_shop_id_worker_user_id_key UNIQUE (shop_id, worker_user_id);


--
-- Name: shops shops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_pkey PRIMARY KEY (id);


--
-- Name: shops shops_wallet_btc_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_wallet_btc_unique UNIQUE (wallet_btc);


--
-- Name: shops shops_wallet_eth_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_wallet_eth_unique UNIQUE (wallet_eth);


--
-- Name: shops shops_wallet_ltc_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_wallet_ltc_unique UNIQUE (wallet_ltc);


--
-- Name: shops shops_wallet_usdt_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_wallet_usdt_unique UNIQUE (wallet_usdt);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_user_id_shop_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_shop_id_key UNIQUE (user_id, shop_id);


--
-- Name: synced_products synced_products_follow_id_source_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_products
    ADD CONSTRAINT synced_products_follow_id_source_product_id_key UNIQUE (follow_id, source_product_id);


--
-- Name: synced_products synced_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_products
    ADD CONSTRAINT synced_products_pkey PRIMARY KEY (id);


--
-- Name: synced_products synced_products_synced_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_products
    ADD CONSTRAINT synced_products_synced_product_id_key UNIQUE (synced_product_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_telegram_id_key UNIQUE (telegram_id);


--
-- Name: users_sync_deleted_at_idx; Type: INDEX; Schema: neon_auth; Owner: -
--

CREATE INDEX users_sync_deleted_at_idx ON neon_auth.users_sync USING btree (deleted_at);


--
-- Name: idx_invoices_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_address ON public.invoices USING btree (address);


--
-- Name: idx_invoices_address_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_invoices_address_unique ON public.invoices USING btree (address) WHERE (address IS NOT NULL);


--
-- Name: idx_invoices_chain_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_chain_status ON public.invoices USING btree (chain, status);


--
-- Name: idx_invoices_crystalpay_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_invoices_crystalpay_id ON public.invoices USING btree (crystalpay_id) WHERE (crystalpay_id IS NOT NULL);


--
-- Name: idx_invoices_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_order_id ON public.invoices USING btree (order_id);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_invoices_tx_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_tx_hash ON public.invoices USING btree (tx_hash) WHERE (tx_hash IS NOT NULL);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id);


--
-- Name: idx_orders_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_buyer ON public.orders USING btree (buyer_id);


--
-- Name: idx_orders_created_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_status ON public.orders USING btree (created_at, status) WHERE ((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text]));


--
-- Name: idx_orders_crypto_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_crypto_payment ON public.orders USING btree (id, crypto_currency) WHERE (crypto_currency IS NOT NULL);


--
-- Name: idx_orders_payment_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_payment_hash ON public.orders USING btree (payment_hash) WHERE (payment_hash IS NOT NULL);


--
-- Name: idx_orders_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_product ON public.orders USING btree (product_id);


--
-- Name: idx_orders_product_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_product_status ON public.orders USING btree (product_id, status);


--
-- Name: idx_orders_shop_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_shop_status_created ON public.orders USING btree (product_id, status, created_at DESC) WHERE ((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text, ('shipped'::character varying)::text]));


--
-- Name: INDEX idx_orders_shop_status_created; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_orders_shop_status_created IS 'Composite index for seller dashboard: filter by product/shop + status + sort by date (40% faster)';


--
-- Name: idx_orders_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status_created ON public.orders USING btree (status, created_at DESC);


--
-- Name: idx_payments_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_order_id ON public.payments USING btree (order_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_payments_subscription_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_subscription_id ON public.payments USING btree (subscription_id);


--
-- Name: idx_payments_tx_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_tx_hash ON public.payments USING btree (tx_hash);


--
-- Name: idx_processed_webhooks_webhook_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processed_webhooks_webhook_id ON public.processed_webhooks USING btree (webhook_id);


--
-- Name: idx_products_availability; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_availability ON public.products USING btree (id, stock_quantity, reserved_quantity) WHERE (is_active = true);


--
-- Name: idx_products_discount_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_discount_active ON public.products USING btree (shop_id, discount_percentage, discount_expires_at) WHERE (discount_percentage > (0)::numeric);


--
-- Name: idx_products_preorder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_preorder ON public.products USING btree (shop_id, is_preorder) WHERE (is_preorder = true);


--
-- Name: idx_products_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_shop ON public.products USING btree (shop_id);


--
-- Name: idx_products_shop_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_shop_active ON public.products USING btree (shop_id, is_active);


--
-- Name: idx_products_shop_active_partial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_shop_active_partial ON public.products USING btree (shop_id) WHERE (is_active = true);


--
-- Name: idx_products_shop_active_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_shop_active_updated ON public.products USING btree (shop_id, is_active, updated_at DESC);


--
-- Name: INDEX idx_products_shop_active_updated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_products_shop_active_updated IS 'Composite index for product listings: filter by shop + active status + sort by updates';


--
-- Name: idx_products_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_updated_at ON public.products USING btree (updated_at);


--
-- Name: idx_promo_activations_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_activations_code ON public.promo_activations USING btree (promo_code);


--
-- Name: idx_promo_activations_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_activations_shop ON public.promo_activations USING btree (shop_id);


--
-- Name: idx_promo_activations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_activations_user ON public.promo_activations USING btree (user_id);


--
-- Name: idx_promo_codes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_codes_active ON public.promo_codes USING btree (is_active, expires_at);


--
-- Name: idx_promo_codes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_codes_code ON public.promo_codes USING btree (code) WHERE (is_active = true);


--
-- Name: idx_refresh_tokens_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_active ON public.refresh_tokens USING btree (expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_refresh_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_hash ON public.refresh_tokens USING btree (token_hash);


--
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_shop_follows_active_partial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_follows_active_partial ON public.shop_follows USING btree (follower_shop_id, source_shop_id) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_shop_follows_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_follows_created_at ON public.shop_follows USING btree (created_at DESC);


--
-- Name: idx_shop_follows_follower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_follows_follower ON public.shop_follows USING btree (follower_shop_id);


--
-- Name: idx_shop_follows_follower_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_follows_follower_status_created ON public.shop_follows USING btree (follower_shop_id, status, created_at DESC);


--
-- Name: INDEX idx_shop_follows_follower_status_created; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_shop_follows_follower_status_created IS 'Composite index for follower dashboard: filter by follower + status + sort by date';


--
-- Name: idx_shop_follows_markup_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_follows_markup_type ON public.shop_follows USING btree (markup_type);


--
-- Name: idx_shop_follows_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_follows_mode ON public.shop_follows USING btree (mode);


--
-- Name: idx_shop_follows_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_follows_source ON public.shop_follows USING btree (source_shop_id);


--
-- Name: idx_shop_follows_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_follows_status ON public.shop_follows USING btree (status);


--
-- Name: idx_shop_subscriptions_period_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_subscriptions_period_end ON public.shop_subscriptions USING btree (period_end);


--
-- Name: idx_shop_subscriptions_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_subscriptions_shop ON public.shop_subscriptions USING btree (shop_id);


--
-- Name: idx_shop_subscriptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_subscriptions_status ON public.shop_subscriptions USING btree (status);


--
-- Name: idx_shop_subscriptions_telegram_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_subscriptions_telegram_id ON public.shop_subscriptions USING btree (user_id, status);


--
-- Name: INDEX idx_shop_subscriptions_telegram_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_shop_subscriptions_telegram_id IS 'Composite index for user subscription lookups by status';


--
-- Name: idx_shop_subscriptions_tx_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_subscriptions_tx_hash ON public.shop_subscriptions USING btree (tx_hash);


--
-- Name: idx_shop_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_subscriptions_user_id ON public.shop_subscriptions USING btree (user_id);


--
-- Name: idx_shop_subscriptions_user_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_subscriptions_user_shop ON public.shop_subscriptions USING btree (user_id, shop_id);


--
-- Name: idx_shop_workers_shop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_workers_shop_id ON public.shop_workers USING btree (shop_id);


--
-- Name: idx_shop_workers_worker_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_workers_worker_user_id ON public.shop_workers USING btree (worker_user_id);


--
-- Name: idx_shops_channel_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_channel_url ON public.shops USING btree (channel_url);


--
-- Name: idx_shops_name_unique_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_shops_name_unique_lower ON public.shops USING btree (lower((name)::text));


--
-- Name: idx_shops_next_payment_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_next_payment_due ON public.shops USING btree (next_payment_due);


--
-- Name: idx_shops_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_owner ON public.shops USING btree (owner_id);


--
-- Name: idx_shops_subscription_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_subscription_status ON public.shops USING btree (subscription_status);


--
-- Name: idx_shops_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_tier ON public.shops USING btree (tier);


--
-- Name: idx_shops_trial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_trial ON public.shops USING btree (is_trial, trial_ends_at) WHERE (is_trial = true);


--
-- Name: idx_shops_wallet_btc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_wallet_btc ON public.shops USING btree (wallet_btc) WHERE (wallet_btc IS NOT NULL);


--
-- Name: idx_shops_wallet_btc_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_shops_wallet_btc_unique ON public.shops USING btree (wallet_btc) WHERE (wallet_btc IS NOT NULL);


--
-- Name: INDEX idx_shops_wallet_btc_unique; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_shops_wallet_btc_unique IS 'Ensures Bitcoin wallet addresses are unique across all shops (prevents payment routing conflicts)';


--
-- Name: idx_shops_wallet_eth; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_wallet_eth ON public.shops USING btree (wallet_eth) WHERE (wallet_eth IS NOT NULL);


--
-- Name: idx_shops_wallet_eth_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_shops_wallet_eth_unique ON public.shops USING btree (wallet_eth) WHERE (wallet_eth IS NOT NULL);


--
-- Name: INDEX idx_shops_wallet_eth_unique; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_shops_wallet_eth_unique IS 'Ensures Ethereum wallet addresses are unique across all shops (prevents payment routing conflicts)';


--
-- Name: idx_shops_wallet_ltc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_wallet_ltc ON public.shops USING btree (wallet_ltc) WHERE (wallet_ltc IS NOT NULL);


--
-- Name: idx_shops_wallet_ltc_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_shops_wallet_ltc_unique ON public.shops USING btree (wallet_ltc) WHERE (wallet_ltc IS NOT NULL);


--
-- Name: INDEX idx_shops_wallet_ltc_unique; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_shops_wallet_ltc_unique IS 'Ensures Litecoin wallet addresses are unique across all shops (prevents payment routing conflicts)';


--
-- Name: idx_shops_wallet_usdt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_wallet_usdt ON public.shops USING btree (wallet_usdt) WHERE (wallet_usdt IS NOT NULL);


--
-- Name: idx_shops_wallet_usdt_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_shops_wallet_usdt_unique ON public.shops USING btree (wallet_usdt) WHERE (wallet_usdt IS NOT NULL);


--
-- Name: INDEX idx_shops_wallet_usdt_unique; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_shops_wallet_usdt_unique IS 'Ensures USDT wallet addresses are unique across all shops (prevents payment routing conflicts)';


--
-- Name: idx_subscriptions_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_shop ON public.subscriptions USING btree (shop_id);


--
-- Name: idx_subscriptions_telegram_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_telegram_id ON public.subscriptions USING btree (telegram_id);


--
-- Name: idx_subscriptions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_user ON public.subscriptions USING btree (user_id);


--
-- Name: idx_synced_products_conflict; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synced_products_conflict ON public.synced_products USING btree (conflict_status);


--
-- Name: idx_synced_products_custom_markup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synced_products_custom_markup ON public.synced_products USING btree (custom_markup_type) WHERE (custom_markup_type IS NOT NULL);


--
-- Name: idx_synced_products_follow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synced_products_follow ON public.synced_products USING btree (follow_id);


--
-- Name: idx_synced_products_follow_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synced_products_follow_status ON public.synced_products USING btree (follow_id, conflict_status);


--
-- Name: idx_synced_products_follow_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synced_products_follow_updated ON public.synced_products USING btree (follow_id, last_synced_at DESC);


--
-- Name: INDEX idx_synced_products_follow_updated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_synced_products_follow_updated IS 'Composite index for sync operations: filter by follow + sort by sync time';


--
-- Name: idx_synced_products_last_synced; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synced_products_last_synced ON public.synced_products USING btree (last_synced_at);


--
-- Name: idx_synced_products_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synced_products_source ON public.synced_products USING btree (source_product_id);


--
-- Name: idx_synced_products_synced; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synced_products_synced ON public.synced_products USING btree (synced_product_id);


--
-- Name: idx_users_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_language ON public.users USING btree (language);


--
-- Name: idx_users_selected_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_selected_role ON public.users USING btree (selected_role);


--
-- Name: idx_users_telegram_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_telegram_role ON public.users USING btree (telegram_id, selected_role);


--
-- Name: synced_products prevent_copy_of_copy; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_copy_of_copy BEFORE INSERT ON public.synced_products FOR EACH ROW EXECUTE FUNCTION public.check_source_not_copy();


--
-- Name: promo_codes trigger_update_promo_codes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_promo_codes_updated_at BEFORE UPDATE ON public.promo_codes FOR EACH ROW EXECUTE FUNCTION public.update_promo_codes_updated_at();


--
-- Name: orders update_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: shops update_shops_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_shops_updated_at BEFORE UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: channel_migrations channel_migrations_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_migrations
    ADD CONSTRAINT channel_migrations_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.shop_subscriptions(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: orders orders_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: orders orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: payments payments_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.shop_subscriptions(id) ON DELETE CASCADE;


--
-- Name: products products_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: promo_activations promo_activations_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_activations
    ADD CONSTRAINT promo_activations_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: promo_activations promo_activations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_activations
    ADD CONSTRAINT promo_activations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shop_follows shop_follows_follower_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_follows
    ADD CONSTRAINT shop_follows_follower_shop_id_fkey FOREIGN KEY (follower_shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: shop_follows shop_follows_source_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_follows
    ADD CONSTRAINT shop_follows_source_shop_id_fkey FOREIGN KEY (source_shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: shop_payments shop_payments_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_payments
    ADD CONSTRAINT shop_payments_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE SET NULL;


--
-- Name: shop_payments shop_payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_payments
    ADD CONSTRAINT shop_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shop_subscriptions shop_subscriptions_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_subscriptions
    ADD CONSTRAINT shop_subscriptions_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: shop_subscriptions shop_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_subscriptions
    ADD CONSTRAINT shop_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shop_workers shop_workers_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_workers
    ADD CONSTRAINT shop_workers_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: shop_workers shop_workers_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_workers
    ADD CONSTRAINT shop_workers_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: shop_workers shop_workers_worker_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_workers
    ADD CONSTRAINT shop_workers_worker_user_id_fkey FOREIGN KEY (worker_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shops shops_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: synced_products synced_products_follow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_products
    ADD CONSTRAINT synced_products_follow_id_fkey FOREIGN KEY (follow_id) REFERENCES public.shop_follows(id) ON DELETE CASCADE;


--
-- Name: synced_products synced_products_source_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_products
    ADD CONSTRAINT synced_products_source_product_id_fkey FOREIGN KEY (source_product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: synced_products synced_products_synced_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_products
    ADD CONSTRAINT synced_products_synced_product_id_fkey FOREIGN KEY (synced_product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict f8lca9HYIR7kh5PnUISQ4Le1scJrSAtn4sMGp64Lf8kLPAWilXPmwuh5D1vHaXM

