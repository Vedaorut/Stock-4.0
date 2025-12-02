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

    // Enter worker mode for this shop
    set({
      workspaceShopId: shop.id,
      workspaceShop: shop,
      isWorkerMode: true,
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
