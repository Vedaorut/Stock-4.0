import axios from 'axios';
import { getApiBaseUrl } from '../../utils/apiBase';
import { normalizeProduct } from '../useStore';

const API_URL = getApiBaseUrl();

export const createShopSlice = (set, get) => ({
  // Products
  products: [],
  productsShopId: null,
  setProducts: (products, shopId = null) => {
    const normalized = Array.isArray(products) ? products.map(normalizeProduct) : [];
    set({ products: normalized, productsShopId: shopId });
  },

  // Current shop
  currentShop: null,
  setCurrentShop: (shop) => set({ currentShop: shop }),

  // My shop (seller's own shop for Follows page)
  myShop: null,
  setMyShop: (shop) => set({ myShop: shop }),

  // All user's shops (for multi-shop ownership)
  myShops: [],
  setMyShops: (shops) => set({
    myShops: shops,
    myShop: shops[0] || null  // First shop = primary (backward compatibility)
  }),

  // Wallet status for seller tip (null = not loaded, true/false = has wallets)
  myShopHasWallets: null,
  setMyShopHasWallets: (hasWallets) => set({ myShopHasWallets: hasWallets }),

  // Helper to check if shop belongs to current user
  isOwnShop: (shopId) => get().myShops.some(s => s.id === shopId),

  // Subscriptions
  subscriptions: [],
  setSubscriptions: (subscriptions) => set({ subscriptions }),

  // WebSocket actions
  refetchProducts: async (shopId) => {

    try {
      const response = await axios.get(`${API_URL}/products`, {
        params: { shopId },
      });

      const payload = Array.isArray(response.data?.data) ? response.data.data : [];
      const normalized = payload.map(normalizeProduct);
      const { currentShop, productsShopId } = get();
      const shouldUpdate = currentShop?.id === shopId || productsShopId === shopId;

      if (shouldUpdate) {
        set({ products: normalized, productsShopId: shopId });
      }
    } catch {
      // Error handled silently
    }
  },

  incrementSubscribers: (shopId) => {
    set((state) => ({
      subscriptions: state.subscriptions.map((sub) =>
        sub.id === shopId ? { ...sub, subscriber_count: (sub.subscriber_count || 0) + 1 } : sub
      ),
    }));
  },
});
