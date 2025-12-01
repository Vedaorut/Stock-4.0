import crypto from 'crypto';
import config from '../../config/index.js';
import { api } from './config.js';

export const authApi = {
  // Register or login user via internal API (bot-to-backend trusted auth)
  async authenticate(telegramId, userData) {
    const requestBody = {
      telegramId: parseInt(telegramId, 10), // Send as integer, not string
      username: userData.username,
      firstName: userData.firstName || userData.first_name, // Support both camelCase and snake_case
      lastName: userData.lastName || userData.last_name || '',
    };

    if (!config.internalSecret) {
      throw new Error('Missing INTERNAL_SECRET for bot internal auth');
    }

    if (!config.botToken) {
      throw new Error('Missing BOT_TOKEN for request signing');
    }

    // Generate HMAC signature using BOT_TOKEN (not INTERNAL_SECRET)
    // This proves request comes from bot - even if INTERNAL_SECRET leaks,
    // attacker cannot forge signature without BOT_TOKEN
    const timestamp = Date.now().toString();
    const payload = JSON.stringify(requestBody) + timestamp;
    const signature = crypto
      .createHmac('sha256', config.botToken)
      .update(payload)
      .digest('hex');

    // Use internal API endpoint with x-internal-secret header
    // This bypasses Telegram initData verification for bot auth
    const { data } = await api.post('/internal/auth/bot-register', requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': config.internalSecret,
        'x-internal-timestamp': timestamp,
        'x-internal-signature': signature,
      },
    });
    // Unwrap response: return { token, user }
    return data.data || data;
  },

  // Update user role
  async updateRole(role, token) {
    const { data } = await api.patch(
      '/auth/role',
      { role },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.data || data;
  },
};
