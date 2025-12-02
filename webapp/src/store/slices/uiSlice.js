export const createUISlice = (set) => ({
  // UI State
  isCartOpen: false,
  setCartOpen: (isOpen) => set({ isCartOpen: isOpen }),

  activeTab: 'subscriptions',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // View Mode (buyer/seller)
  viewMode: 'buyer', // 'buyer' | 'seller'
  setViewMode: (mode) => set({ viewMode: mode }),

  hasFollows: false,
  setHasFollows: (value) => set({ hasFollows: Boolean(value) }),

  // Language
  language: 'ru',
  setLanguage: (lang) => set({ language: lang }),
});
