import { api } from './config.js';

export const notificationApi = {
  // Migrate shop notification channel
  // Fixed: /notifications/migrate-channel doesn't exist
  // Use /shops/:shopId/migration instead (migrationController)
  async migrateChannel(shopId, newChannel, token) {
    const { data } = await api.post(
      `/shops/${shopId}/migration`,
      {
        newChannelUrl: newChannel, // migrationController expects newChannelUrl in body
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.data || data;
  },
};
