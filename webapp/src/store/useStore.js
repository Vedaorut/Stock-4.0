import { create } from 'zustand';
import { mockShops, mockProducts, mockSubscriptions, mockUser } from '../utils/mockData';
import { generateWalletAddress, generateOrderId } from '../utils/paymentUtils';

export const useStore = create((set, get) => ({
      // User data
      user: mockUser,
      setUser: (user) => set({ user }),

      // Cart
      cart: [],
      addToCart: (product) => {
        const currentCart = get().cart;
        const existingItem = currentCart.find(item => item.id === product.id);

        if (existingItem) {
          set({
            cart: currentCart.map(item =>
              item.id === product.id
                ? { ...item, quantity: item.quantity + 1 }
                : item
            )
          });
        } else {
          set({ cart: [...currentCart, { ...product, quantity: 1 }] });
        }
      },

      removeFromCart: (productId) => {
        set({ cart: get().cart.filter(item => item.id !== productId) });
      },

      updateCartQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeFromCart(productId);
          return;
        }

        set({
          cart: get().cart.map(item =>
            item.id === productId
              ? { ...item, quantity }
              : item
          )
        });
      },

      clearCart: () => set({ cart: [] }),

      getCartTotal: () => {
        return get().cart.reduce((total, item) => total + (item.price * item.quantity), 0);
      },

      getCartCount: () => {
        return get().cart.reduce((total, item) => total + item.quantity, 0);
      },

      // Shops
      shops: mockShops,
      setShops: (shops) => set({ shops }),

      // Products
      products: mockProducts,
      setProducts: (products) => set({ products }),

      // Current shop
      currentShop: null,
      setCurrentShop: (shop) => set({ currentShop: shop }),

      // Subscriptions
      subscriptions: mockSubscriptions,
      setSubscriptions: (subscriptions) => set({ subscriptions }),

      // UI State
      isCartOpen: false,
      setCartOpen: (isOpen) => set({ isCartOpen: isOpen }),

      activeTab: 'subscriptions',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // Payment State
      currentOrder: null,
      selectedCrypto: null,
      paymentStep: 'idle',
      pendingOrders: [],
      paymentWallet: null,

      // Payment Actions
      startCheckout: () => {
        const cart = get().cart;
        const total = get().getCartTotal();

        if (cart.length === 0) return;

        const order = {
          id: generateOrderId(),
          items: cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
          })),
          total,
          createdAt: new Date().toISOString(),
          status: 'pending'
        };

        set({
          currentOrder: order,
          paymentStep: 'method'
        });
      },

      selectCrypto: (crypto) => {
        const wallet = generateWalletAddress(crypto);

        set({
          selectedCrypto: crypto,
          paymentWallet: wallet,
          paymentStep: 'details'
        });
      },

      submitPaymentHash: (hash) => {
        const { currentOrder, selectedCrypto, paymentWallet } = get();

        if (!currentOrder) return;

        const completedOrder = {
          ...currentOrder,
          crypto: selectedCrypto,
          wallet: paymentWallet,
          txHash: hash,
          status: 'pending',
          submittedAt: new Date().toISOString()
        };

        set({
          pendingOrders: [...get().pendingOrders, completedOrder],
          paymentStep: 'success'
        });
      },

      clearCheckout: () => {
        get().clearCart();
        set({
          currentOrder: null,
          selectedCrypto: null,
          paymentStep: 'idle',
          paymentWallet: null
        });
      },

      setPaymentStep: (step) => set({ paymentStep: step }),

      removePendingOrder: (orderId) => {
        set({
          pendingOrders: get().pendingOrders.filter(order => order.id !== orderId)
        });
      },

      // Wallets
      wallets: [],
      addWallet: (wallet) => set({ wallets: [...get().wallets, wallet] }),
      removeWallet: (address) => set({ wallets: get().wallets.filter(w => w.address !== address) }),

      // Language
      language: 'ru',
      setLanguage: (lang) => set({ language: lang })
}));
