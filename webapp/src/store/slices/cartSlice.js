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
      toast({ type: 'warning', message: 'Clear the cart to shop from another store', duration: 3000 });
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
      // Save shopId with the product for restoring currentShop at checkout
      const shopId = currentShop?.id || product.shop_id || product.shopId || productsShopId;

      if (!shopId) {
        // P1 FIX: Show user-visible error instead of silent failure
        const toast = useToastStore.getState().addToast;
        toast({ type: 'error', message: 'Cannot add to cart - shop not found', duration: 3000 });

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
    // NOTE: Don't reset payment flow here!
    // If called from submitPaymentHash after success, we need to keep paymentStep='success'
    // resetPaymentFlow is called explicitly when needed (e.g., clearCheckout)
  },

  getCartTotal: () => {
    return get().cart.reduce((total, item) => total + item.price * item.quantity, 0);
  },

  getCartCount: () => {
    return get().cart.reduce((total, item) => total + item.quantity, 0);
  },

  // BUG-WEBAPP-004: Validate cart before checkout
  // Returns { valid: boolean, errors: string[], invalidItems: array }
  validateCart: () => {
    const { cart, myShops } = get();
    const errors = [];
    const invalidItems = [];

    if (cart.length === 0) {
      return { valid: false, errors: ['Cart is empty'], invalidItems: [] };
    }

    // Check each item
    cart.forEach((item) => {
      const itemErrors = [];

      // Check price validity
      if (!item.price || item.price <= 0) {
        itemErrors.push('Invalid price');
      }

      // Check quantity validity
      if (!item.quantity || item.quantity <= 0) {
        itemErrors.push('Invalid quantity');
      }

      // Check stock (for non-preorder items)
      const isPreorder = item.isPreorder || item.availability === 'preorder';
      const stock = item.stock_quantity || item.stock || 0;

      if (!isPreorder && item.quantity > stock) {
        itemErrors.push(`Only ${stock} available`);
      }

      // Check if item has required data
      if (!item.id) {
        itemErrors.push('Missing product ID');
      }

      if (!item.shopId) {
        itemErrors.push('Missing shop information');
      }

      if (itemErrors.length > 0) {
        invalidItems.push({
          id: item.id,
          name: item.name,
          errors: itemErrors,
        });
      }
    });

    // Check if cart contains items from user's own shop
    if (myShops?.length > 0) {
      const cartShopId = cart[0]?.shopId;
      const isOwnShop = myShops.some((shop) => shop.id === cartShopId);

      if (isOwnShop) {
        errors.push('Cannot order from your own shop');
      }
    }

    // Check all items from same shop
    const shopIds = [...new Set(cart.map((item) => item.shopId).filter(Boolean))];
    if (shopIds.length > 1) {
      errors.push('Cart contains items from multiple shops');
    }

    // Calculate total
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (total <= 0) {
      errors.push('Cart total must be greater than zero');
    }

    const hasInvalidItems = invalidItems.length > 0;
    const hasErrors = errors.length > 0;

    return {
      valid: !hasInvalidItems && !hasErrors,
      errors: [...errors, ...invalidItems.flatMap((item) => item.errors.map((e) => `${item.name}: ${e}`))],
      invalidItems,
      total,
    };
  },
});
