import { api } from './config.js';

export const walletApi = {
  // Get shop wallets
  async getWallets(shopId, token) {
    const { data } = await api.get(`/shops/${shopId}/wallets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Update shop wallets
  async updateWallets(shopId, wallets, token) {
    const { data } = await api.put(`/shops/${shopId}/wallets`, wallets, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Generate QR code for wallet
  async generateQR(qrData, token) {
    const { data } = await api.post('/payments/qr', qrData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  },
};
