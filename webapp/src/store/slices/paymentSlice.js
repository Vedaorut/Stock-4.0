import axios from 'axios';
import { useToastStore } from '../../hooks/useToast';
import { getApiBaseUrl } from '../../utils/apiBase';
import { normalizeOrder } from '../useStore';
import { t } from '../../i18n';

const API_URL = getApiBaseUrl();

export const createPaymentSlice = (set, get) => ({
  // Payment State
  currentOrder: null,
  selectedCrypto: null,
  paymentStep: 'idle',
  pendingOrders: [],
  paymentWallet: null,
  cryptoAmount: 0,
  invoiceExpiresAt: null,
  isVerifying: false,
  verifyError: null,
  isCreatingOrder: false,
  isGeneratingInvoice: false,

  // Payment Actions
  // FIX BUG-WEBAPP-004: Returns validation result for UI feedback
  startCheckout: () => {
    const { cart } = get();
    const toast = useToastStore.getState().addToast;

    if (cart.length === 0) {
      return { success: false, error: 'empty_cart' };
    }

    // FIX: Validate cart items
    const invalidItems = cart.filter((item) => item.price <= 0 || item.quantity <= 0);
    if (invalidItems.length > 0) {
      if (import.meta.env.DEV) {
        console.error('[startCheckout] Invalid cart items:', invalidItems);
      }
      toast(t('errors.cartInvalid'), 'error');
      return { success: false, error: 'invalid_items' };
    }

    // FIX: Validate cart total
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (total <= 0) {
      if (import.meta.env.DEV) {
        console.error('[startCheckout] Invalid cart total:', total);
      }
      toast(t('cart.zeroTotal'), 'error');
      return { success: false, error: 'invalid_total' };
    }

    // FIX: Validate all products from same shop (multi-shop orders not allowed)
    const cartShopIds = cart.map((item) => item.shopId).filter(Boolean);
    const uniqueShops = new Set(cartShopIds);

    if (uniqueShops.size > 1) {
      if (import.meta.env.DEV) {
        console.error('[startCheckout] Multi-shop order attempt!', {
          shops: Array.from(uniqueShops),
          items: cart.map((i) => ({ id: i.id, name: i.name, shopId: i.shopId })),
        });
      }
      toast(t('cart.multipleShops'), 'error');
      return { success: false, error: 'multi_shop' };
    }

    // Get shopId from first cart item
    const shopId = cart[0]?.shopId;

    if (!shopId) {
      if (import.meta.env.DEV) {
        console.error('[startCheckout] CRITICAL: Cannot checkout - shopId missing!');
        console.error('[startCheckout] Cart item:', cart[0]);
      }

      // Reopen cart so user can take action
      set({ isCartOpen: true });
      toast(t('cart.missingShopInfo'), 'error');
      return { success: false, error: 'no_shop' };
    }

    // FIX: Get FULL shop data (including availableCryptos) from currentShop or myShops
    const { currentShop: existingShop, myShops } = get();

    // Try to find full shop object - first from currentShop, then from myShops
    let shop = null;

    if (existingShop?.id === shopId) {
      // currentShop matches cart shop - use it (has availableCryptos)
      shop = existingShop;
    } else {
      // Look for shop in myShops array
      const foundShop = myShops?.find(s => s.id === shopId);
      if (foundShop) {
        shop = foundShop;
      }
    }

    // Fallback: create minimal shop object if not found
    // NOTE: This will cause "no wallets" error - but at least won't crash
    if (!shop) {
      shop = { id: shopId, name: existingShop?.name || 'Shop' };
    }

    // FIX: ALWAYS clear currentOrder to force fresh creation
    // This prevents stale order reuse after cart quantity changes
    set({
      currentShop: shop,
      currentOrder: null, // Force re-create order with current cart totals
      selectedCrypto: null,
      paymentWallet: null,
      cryptoAmount: 0,
      invoiceExpiresAt: null,
      verifyError: null,
      paymentStep: 'method',
    });

    return { success: true };
  },

  // Use closure for synchronous lock to prevent race condition on fast double-clicks
  createOrder: (() => {
    let orderInProgress = false; // Synchronous lock (same pattern as selectCrypto)

    return async () => {
      const { cart, isCreatingOrder } = get();
      const toast = useToastStore.getState().addToast;

      // Check BOTH store state AND closure variable for race prevention
      if (isCreatingOrder || orderInProgress) {
        toast(t('payment.alreadyCreating'), 'warning');
        return null;
      }

      if (cart.length === 0) {
        toast(t('cart.empty'), 'warning');
        return null;
      }

      // Set BOTH locks IMMEDIATELY (synchronous)
      orderInProgress = true;
      set({ isCreatingOrder: true });

      let timeoutId; // Moved BEFORE try block for finally access
      try {
      const initData = window.Telegram?.WebApp?.initData || '';

      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 8000);

      // Prepare payload
      const payload = {
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
        deliveryAddress: null,
      };

      // DEBUG: Validate payload before sending (catch corrupt data early)
      const invalidItems = payload.items.filter(
        (item) =>
          typeof item.productId !== 'number' ||
          item.productId <= 0 ||
          typeof item.quantity !== 'number' ||
          item.quantity <= 0
      );

      if (invalidItems.length > 0) {
        if (import.meta.env.DEV) {
          console.error('[createOrder] Invalid items in cart!', invalidItems);
          console.error('Full cart state:', cart);
        }
        toast(t('cart.validationError'), 'error');
        return null;
      }

      // Get current token from store
      const { token } = get();

      // Send ALL cart items to backend
      const response = await axios.post(`${API_URL}/orders`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
          ...(token && { Authorization: `Bearer ${token}` }), // FIX: Add auth token!
        },
        signal: controller.signal,
      });

      // Normalize order (PostgreSQL DECIMAL fields come as strings)
      const order = normalizeOrder(response.data.data);
      set({
        currentOrder: order,
      });

      return order;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[createOrder] Error:', error);

        // Enhanced error logging for debugging 400 errors
        if (error.response) {
          console.error('Server Response Status:', error.response.status);
          console.error('Server Response Data:', error.response.data);
        }
      }

      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
      } else if (error.response?.status === 401) {
      } else if (error.response?.status === 400) {
        // FIX: Parse specific 400 error messages from backend
        const errorData = error.response.data;
        const toast = useToastStore.getState().addToast;

        if (errorData?.error === 'Malformed JSON payload') {
          toast(t('payment.orderDataError'), 'error');
        } else if (errorData?.error?.includes('cannot order your own')) {
          // User trying to order their own products
          toast(t('cart.cannotOrderOwn'), 'warning');
        } else if (errorData?.error?.includes('Insufficient stock')) {
          // Extract product name and show specific error
          toast(t('payment.insufficientStock'), 'error');
        } else if (errorData?.error) {
          // Show backend error message if available
          toast(errorData.error, 'error');
        } else {
          toast('Order creation error', 'error');
        }
      } else {
        const toast = useToastStore.getState().addToast;
        toast(t('payment.connectionError'), 'error');
      }

      throw error;
      } finally {
        // CRITICAL: Always cleanup timeout and reset loading state
        orderInProgress = false; // Reset synchronous lock
        set({ isCreatingOrder: false });
        if (timeoutId) clearTimeout(timeoutId);
      }
    };
  })(), // End of createOrder closure IIFE

  // Use closure for synchronous lock to prevent race condition on fast double-clicks
  selectCrypto: (() => {
    let invoiceInProgress = false; // Synchronous lock

    return async (crypto) => {
      // Normalize to UPPERCASE before everything (fix ID case mismatch)
      const normalizedCrypto = crypto.toUpperCase();

      const { currentOrder, isGeneratingInvoice } = get();
      const toast = useToastStore.getState().addToast;

      // Check BOTH store state AND closure variable
      if (isGeneratingInvoice || invoiceInProgress) {
        return;
      }

      // Set BOTH locks IMMEDIATELY (synchronous)
      invoiceInProgress = true;

      let timeoutId; // Declare before try for finally access
      const controller = new AbortController();

      try {
        set({
          selectedCrypto: normalizedCrypto,
          isGeneratingInvoice: true,
        });
        timeoutId = setTimeout(() => controller.abort(), 8000);

        // FIX: Calculate current cart total for validation
        const cart = get().cart;
        const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

        // Create order if not exists
        let order = currentOrder;
        if (!order) {
          order = await get().createOrder();
          if (!order) {
            if (import.meta.env.DEV) {
              console.error('[selectCrypto] ERROR: Failed to create order');
            }
            throw new Error('Failed to create order');
          }
        } else {
          // Validate order total matches cart total
          // Use integer cents comparison to avoid floating point errors
          const orderTotalCents = Math.round((parseFloat(order.total_price) || 0) * 100);
          const cartTotalCents = Math.round(cartTotal * 100);
          const diffCents = Math.abs(orderTotalCents - cartTotalCents);

          if (diffCents > 1) {  // 1 cent tolerance
            // Re-create order with current cart data
            order = await get().createOrder();
            if (!order) {
              if (import.meta.env.DEV) {
                console.error('[selectCrypto] ERROR: Failed to re-create order');
              }
              throw new Error('Failed to re-create order');
            }
          }
        }

        // FIX: Get token for authorization
        const { token } = get();

        // FIX: Use new payment-info endpoint (GET with query param)
        const response = await axios.get(
          `${API_URL}/orders/${order.id}/payment-info`,
          {
            params: { currency: normalizedCrypto },
            headers: {
              ...(token && { Authorization: `Bearer ${token}` }),
            },
            signal: controller.signal,
          }
        );

        const paymentInfo = response.data.data;

        // Ensure amount is NUMBER (backend might return string from PostgreSQL)
        const cryptoAmount = parseFloat(paymentInfo.amount);

        if (!isFinite(cryptoAmount) || cryptoAmount <= 0) {
          if (import.meta.env.DEV) {
            console.error('[selectCrypto] Invalid amount:', { paymentInfo, cryptoAmount });
          }
          toast({ type: 'error', message: 'Invalid amount from server', duration: 3000 });
          throw new Error('Invalid amount from API');
        }

        // Calculate expiration time from expiresIn (seconds)
        const expiresAt = paymentInfo.expiresIn
          ? new Date(Date.now() + paymentInfo.expiresIn * 1000).toISOString()
          : null;

        set({
          paymentWallet: paymentInfo.address,
          cryptoAmount,
          invoiceExpiresAt: expiresAt,
          paymentStep: 'details',
          verifyError: null,
        });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[selectCrypto] API ERROR:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            fullError: error,
          });
        }

        // Handle timeout/abort
        if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          set({
            paymentStep: 'method',
            verifyError: t('payment.timeoutInvoice'),
          });
          throw error;
        }

        // FIX: Show error toast to user with specific messages
        const errorMsg = error.response?.data?.error || error.message;
        if (errorMsg?.includes('price_service_error') || errorMsg?.includes('exchange rate')) {
          toast({ type: 'error', message: t('payment.exchangeUnavailable'), duration: 4000 });
        } else if (errorMsg?.includes('Invalid currency')) {
          toast({ type: 'error', message: 'Unsupported currency', duration: 3000 });
        } else if (errorMsg?.includes('does not accept')) {
          toast({ type: 'error', message: 'Seller does not accept this cryptocurrency', duration: 3000 });
        } else if (errorMsg?.includes('order')) {
          toast({ type: 'error', message: 'Order creation error', duration: 3000 });
        } else if (errorMsg?.includes('wallet') || errorMsg?.includes('address')) {
          toast({ type: 'error', message: 'Address generation error', duration: 3000 });
        } else if (errorMsg?.includes('timeout') || errorMsg?.includes('network')) {
          toast({ type: 'error', message: t('payment.timeout'), duration: 3000 });
        } else if (errorMsg?.includes('expired')) {
          toast({ type: 'error', message: t('payment.invoiceExpired'), duration: 3000 });
        } else {
          // Log unknown errors for debugging
          if (import.meta.env.DEV) {
            console.error('[selectCrypto] Unknown error type:', errorMsg);
          }
          toast({ type: 'error', message: t('payment.invoiceError'), duration: 3000 });
        }

        set({
          paymentStep: 'method', // Return to method selection on error
          verifyError: error.response?.data?.error || 'Invoice generation error',
        });
        throw error;
      } finally {
        // CRITICAL: Always reset loading state, even on unhandled errors
        invoiceInProgress = false; // Reset synchronous lock
        set({ isGeneratingInvoice: false });
        if (timeoutId) clearTimeout(timeoutId); // Cleanup timeout
      }
    };
  })(), // End of closure IIFE

  // Use closure for synchronous lock to prevent race condition on fast double-clicks
  // FIX BUG-WEBAPP-005: Add processing lock to prevent duplicate payment submissions
  submitPaymentHash: (() => {
    let submitInProgress = false; // Synchronous lock

    return async (hash) => {
      const { currentOrder, selectedCrypto, isVerifying } = get();
      const toast = useToastStore.getState().addToast;

      if (!currentOrder) {
        return;
      }

      // Check BOTH store state AND closure variable for race prevention
      if (isVerifying || submitInProgress) {
        toast(t('payment.alreadySubmitting'), 'warning');
        return;
      }

      // Set BOTH locks IMMEDIATELY (synchronous)
      submitInProgress = true;
      set({ isVerifying: true, verifyError: null });

      let timeoutId; // Declare before try for finally access
      const controller = new AbortController();

      try {
        timeoutId = setTimeout(() => controller.abort(), 10000);

        // Use direct crypto payment endpoint (not invoice-based)
        const { token } = get();
        const response = await axios.post(
          `${API_URL}/orders/${currentOrder.id}/submit-payment`,
          {
            tx_hash: hash,
            currency: selectedCrypto,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              ...(token && { Authorization: `Bearer ${token}` }),
            },
            signal: controller.signal,
          }
        );

        if (response.data.success) {
          // Payment submitted - status is 'pending' until blockchain confirms
          // Show success UI, verification happens in background
          const submittedOrder = normalizeOrder({
            ...currentOrder,
            crypto: selectedCrypto,
            txHash: hash,
            paymentId: response.data.data?.paymentId,
            status: 'pending', // Will become 'confirmed' after blockchain verification
            submittedAt: new Date().toISOString(),
          });

          set({
            pendingOrders: [...get().pendingOrders, submittedOrder],
            paymentStep: 'success', // Show success - payment is being verified
          });

          // Clear cart
          get().clearCart();
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Verify payment error:', error);
        }

        // Handle timeout/abort
        if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          set({
            verifyError: t('payment.timeoutVerify'),
          });
          return; // Don't throw, just return
        }

        // Detailed error messages for different error types
        const errorMsg = error.response?.data?.error || error.message;
        const statusCode = error.response?.status;
        let userFriendlyError = t('payment.verifyError');

        if (statusCode === 404) {
          userFriendlyError = t('errors.orderNotFound');
        } else if (errorMsg?.includes('confirmation')) {
          userFriendlyError = t('payment.txNotConfirmed');
        } else if (errorMsg?.includes('amount')) {
          userFriendlyError = t('payment.amountMismatch');
        } else if (errorMsg?.includes('address') || errorMsg?.includes('wallet')) {
          userFriendlyError = t('payment.invalidWallet');
        } else if (errorMsg?.includes('expired')) {
          userFriendlyError = t('payment.windowExpired');
        } else if (errorMsg?.includes('timeout') || errorMsg?.includes('network')) {
          userFriendlyError = t('errors.networkError');
        } else if (errorMsg?.includes('invalid') || errorMsg?.includes('hash')) {
          userFriendlyError = t('payment.invalidTxHash');
        } else if (errorMsg) {
          userFriendlyError = errorMsg;
        }

        set({
          verifyError: userFriendlyError,
        });
      } finally {
        // CRITICAL: Always reset loading state and synchronous lock
        submitInProgress = false; // Reset synchronous lock
        set({ isVerifying: false });
        if (timeoutId) clearTimeout(timeoutId); // Cleanup timeout
      }
    };
  })(), // End of closure IIFE

  // Universal payment flow reset with options
  resetPaymentFlow: (options = {}) => {
    const {
      clearCart = false, // Clear shopping cart?
      clearPendingOrders = false, // Clear order history?
      keepOrder = false, // Keep currentOrder for retry?
      // reason param available for debugging: 'manual', 'success', 'error', 'timeout'
    } = options;

    // Clear cart if requested
    if (clearCart) {
      get().clearCart();
    }

    // Full payment state cleanup
    set({
      // Order data
      currentOrder: keepOrder ? get().currentOrder : null,
      selectedCrypto: null,

      // Flow control
      paymentStep: 'idle',

      // Payment details
      paymentWallet: null,
      cryptoAmount: 0,
      invoiceExpiresAt: null,

      // Loading states (CRITICAL to reset!)
      isCreatingOrder: false,
      isGeneratingInvoice: false,
      isVerifying: false,

      // Errors
      verifyError: null,

      // History (optional)
      ...(clearPendingOrders ? { pendingOrders: [] } : {}),
    });
  },

  clearCheckout: () => {
    // Use universal reset function
    get().resetPaymentFlow({ clearCart: true, reason: 'manual' });
  },

  setPaymentStep: (step) => set({ paymentStep: step }),

  // FIX BUG-WEBAPP-003: Normalize orderId to ensure consistent comparison
  removePendingOrder: (orderId) => {
    const normalizedId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    set({
      pendingOrders: get().pendingOrders.filter((order) => {
        const orderIdNum = typeof order.id === 'string' ? parseInt(order.id, 10) : order.id;
        return orderIdNum !== normalizedId;
      }),
    });
  },

  // FIX BUG-WEBAPP-003: Normalize orderId to ensure consistent comparison
  updateOrderStatus: (orderId, status) => {
    const normalizedId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    set((state) => ({
      orders: state.orders?.map((order) => {
        const orderIdNum = typeof order.id === 'string' ? parseInt(order.id, 10) : order.id;
        return orderIdNum === normalizedId ? { ...order, status } : order;
      }),
      currentOrder: (() => {
        if (!state.currentOrder) return null;
        const currentIdNum = typeof state.currentOrder.id === 'string'
          ? parseInt(state.currentOrder.id, 10)
          : state.currentOrder.id;
        return currentIdNum === normalizedId
          ? { ...state.currentOrder, status }
          : state.currentOrder;
      })(),
      // P1-3 FIX: Also update pendingOrders for real-time status sync
      pendingOrders: state.pendingOrders?.map((order) => {
        const orderIdNum = typeof order.id === 'string' ? parseInt(order.id, 10) : order.id;
        return orderIdNum === normalizedId ? { ...order, status } : order;
      }),
    }));
  },
});
