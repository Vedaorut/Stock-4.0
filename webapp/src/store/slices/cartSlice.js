import { useToastStore } from '../../hooks/useToast';

export const createCartSlice = (set, get) => ({
  // Cart
  cart: [],
  addToCart: (product) => {
    const { cart: currentCart, currentShop, productsShopId } = get();

    // FIX: Cart isolation - prevent mixing products from different shops
    const productShopId = currentShop?.id || product.shop_id || product.shopId || productsShopId;
    if (currentCart.length > 0 && currentCart[0].shopId !== productShopId) {
      const toast = useToastStore.getState().addToast;
      toast({ type: 'warning', message: 'Очистите корзину для покупок в другом магазине', duration: 3000 });
      if (import.meta.env.DEV) {
        console.error('[addToCart] Cannot add product from different shop. Cart shopId:', currentCart[0].shopId, 'Product shopId:', productShopId);
      }
      return false;
    }

    const existingItem = currentCart.find((item) => item.id === product.id);

    if (existingItem) {
      // STOCK VALIDATION: Check if can increase quantity
      const newQuantity = existingItem.quantity + 1;
      const stock = existingItem.stock_quantity || existingItem.stock || 0;
      const isPreorder = existingItem.isPreorder || existingItem.availability === 'preorder';

      // Allow unlimited quantity for preorders
      if (!isPreorder && newQuantity > stock) {
        return; // Don't add
      }

      set({
        cart: currentCart.map((item) =>
          item.id === product.id ? { ...item, quantity: newQuantity } : item
        ),
        // FIX: Clear stale order when cart changes
        currentOrder: null,
      });
    } else {
      // Сохраняем shopId вместе с товаром для восстановления currentShop при checkout
      const shopId = currentShop?.id || product.shop_id || product.shopId || productsShopId;

      if (!shopId) {
        if (import.meta.env.DEV) {
          console.error('[addToCart] CRITICAL: Cannot add to cart - shopId missing!', product);
        }

        return;
      }

      set({
        cart: [...currentCart, { ...product, quantity: 1, shopId }],
        // FIX: Clear stale order when cart changes
        currentOrder: null,
      });
    }
  },

  removeFromCart: (productId) => {
    set({
      cart: get().cart.filter((item) => item.id !== productId),
      // FIX: Clear stale order when cart changes
      currentOrder: null,
    });
  },

  updateCartQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(productId);
      return;
    }

    const { cart } = get();
    const item = cart.find((i) => i.id === productId);

    if (item) {
      // STOCK VALIDATION: Check if quantity exceeds stock
      const stock = item.stock_quantity || item.stock || 0;
      const isPreorder = item.isPreorder || item.availability === 'preorder';

      // Allow unlimited quantity for preorders
      if (!isPreorder && quantity > stock) {
        // Set to max available stock instead
        quantity = stock;
      }
    }

    set({
      cart: get().cart.map((item) => (item.id === productId ? { ...item, quantity } : item)),
      // FIX: Clear stale order when cart changes
      // Forces order re-creation with updated quantity on next checkout
      currentOrder: null,
    });
  },

  clearCart: () => {
    set({ cart: [] });
    // FIX: Clear payment state to avoid orphan orders
    get().resetPaymentFlow({ clearCart: false, reason: 'cart_cleared' });
  },

  getCartTotal: () => {
    return get().cart.reduce((total, item) => total + item.price * item.quantity, 0);
  },

  getCartCount: () => {
    return get().cart.reduce((total, item) => total + item.quantity, 0);
  },
});
