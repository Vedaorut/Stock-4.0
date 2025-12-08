export const createWorkerSlice = (set, get) => ({
  // Worker Mode
  workspaceShopId: null,
  setWorkspaceShopId: (id) => set({ workspaceShopId: id }),
  isWorkerMode: false,
  setIsWorkerMode: (val) => set({ isWorkerMode: val }),
  workspaceShop: null, // Full shop object for worker context
  setWorkspaceShop: (shop) => set({ workspaceShop: shop }),

  // Switch to workspace shop context (for workers)
  switchToWorkspaceShop: (shop) => {
    if (!shop || !shop.id) {
      // Exit worker mode
      set({
        workspaceShopId: null,
        workspaceShop: null,
        isWorkerMode: false,
      });
      return;
    }

    // P0 FIX: Clear stale products when switching workspace shop
    // Without this, worker sees previous shop's products until API refetch
    set({
      workspaceShopId: shop.id,
      workspaceShop: shop,
      isWorkerMode: true,
      // Clear stale products to force refetch
      products: [],
      productsShopId: null,
    });
  },

  // Get effective shop ID (workspace shop if worker mode, else own shop)
  getEffectiveShopId: () => {
    const { isWorkerMode, workspaceShopId, myShop } = get();
    if (isWorkerMode && workspaceShopId) {
      return workspaceShopId;
    }
    return myShop?.id || null;
  },
});
