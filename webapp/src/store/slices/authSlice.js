import axios from 'axios';

export const createAuthSlice = (set) => ({
  // User data
  user: null,
  setUser: (user) => set({ user }),

  // Auth token
  token: null,
  setToken: (token) => {
    set({ token });
    // Configure axios default header
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  },
});
