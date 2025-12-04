import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  createAuthSlice,
  createCartSlice,
  createShopSlice,
  createPaymentSlice,
  createUISlice,
  createFollowSlice,
  createWorkerSlice,
} from './slices';

/**
 * Normalize product data from API
 * @param {Object} product - Raw product from API
 * @returns {Object} Normalized product
 */
export const normalizeProduct = (product) => {
  const rawStock = product?.stock_quantity ?? product?.stock ?? 0;
  const price = typeof product?.price === 'number' ? product.price : Number(product?.price) || 0;
  const isAvailable = product?.is_available ?? product?.isActive ?? true;
  const isPreorder = isAvailable && rawStock <= 0;
  const availability = !isAvailable ? 'unavailable' : isPreorder ? 'preorder' : 'stock';

  return {
    ...product,
    price,
    stock: rawStock,
    stock_quantity: rawStock,
    is_available: isAvailable,
    isAvailable,
    currency: product?.currency || 'USD',
    image: product?.image || product?.images?.[0] || null,
    isPreorder,
    availability,
    // Explicitly save discount fields
    original_price: product?.original_price ?? null,
    discount_percentage: product?.discount_percentage ?? 0,
    discount_expires_at: product?.discount_expires_at ?? null,
  };
};

/**
 * Normalize order data from API (PostgreSQL DECIMAL fields come as strings)
 * @param {Object} order - Raw order from API
 * @returns {Object} Normalized order with numeric fields
 */
export const normalizeOrder = (order) => {
  if (!order) return null;

  // Convert PostgreSQL DECIMAL strings to numbers
  const totalPrice =
    typeof order.total_price === 'number' ? order.total_price : parseFloat(order.total_price) || 0;

  const total = typeof order.total === 'number' ? order.total : parseFloat(order.total) || 0;

  const quantity =
    typeof order.quantity === 'number' ? order.quantity : parseInt(order.quantity, 10) || 1;

  return {
    ...order,
    total_price: totalPrice,
    total: total,
    quantity: quantity,
  };
};

export const useStore = create(
  persist(
    (...args) => ({
      ...createAuthSlice(...args),
      ...createCartSlice(...args),
      ...createShopSlice(...args),
      ...createPaymentSlice(...args),
      ...createUISlice(...args),
      ...createFollowSlice(...args),
      ...createWorkerSlice(...args),
    }),
    {
      name: 'status-stock-storage',
      partialize: (state) => ({
        // SECURITY FIX: Token removed from localStorage to prevent XSS theft
        // Token is obtained from Telegram initData on each session
        pendingOrders: state.pendingOrders,
        cart: state.cart, // Fix: Persist cart across page refresh
      }),
    }
  )
);
