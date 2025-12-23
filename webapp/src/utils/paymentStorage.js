const ACTIVE_PAYMENT_KEY = 'status-stock-active-payment';

export const getActivePayment = () => {
  try {
    const raw = localStorage.getItem(ACTIVE_PAYMENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const setActivePayment = (payload) => {
  if (!payload) return;
  try {
    localStorage.setItem(ACTIVE_PAYMENT_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable (private mode, iframe, etc.)
  }
};

export const clearActivePayment = () => {
  try {
    localStorage.removeItem(ACTIVE_PAYMENT_KEY);
  } catch {
    // localStorage may be unavailable (private mode, iframe, etc.)
  }
};
