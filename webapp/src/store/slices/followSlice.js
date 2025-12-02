export const createFollowSlice = (set) => ({
  // Follow Detail Navigation
  followDetailId: null,
  setFollowDetailId: (id) => set({ followDetailId: id }),

  // Current Follow Data
  currentFollow: null,
  setCurrentFollow: (follow) => set({ currentFollow: follow }),

  // Follow Products
  followProducts: [],
  setFollowProducts: (products) => set({ followProducts: products }),
});
