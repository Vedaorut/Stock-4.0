import { query } from '../../config/database.js';

/**
 * User database queries
 */
export const userQueries = {
  // Find user by Telegram ID
  findByTelegramId: async (telegramId) => {
    const result = await query(
      'SELECT id, telegram_id, username, first_name, last_name, selected_role, language, created_at, updated_at FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0];
  },

  // Find user by username (case-insensitive)
  findByUsername: async (username) => {
    if (!username) {
      return null;
    }

    const result = await query(
      `SELECT id, telegram_id, username, first_name, last_name, selected_role, language, created_at, updated_at FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [username]
    );
    return result.rows[0];
  },

  // Find user by ID
  findById: async (id) => {
    const result = await query(
      'SELECT id, telegram_id, username, first_name, last_name, selected_role, language, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  // Create new user
  // BACKWARD COMPATIBLE: accepts both camelCase and snake_case
  create: async (userData) => {
    const telegramId = userData.telegram_id || userData.telegramId;
    const username = userData.username;
    const firstName = userData.first_name || userData.firstName;
    const lastName = userData.last_name || userData.lastName;

    const result = await query(
      `INSERT INTO users (telegram_id, username, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at`,
      [telegramId, username, firstName, lastName]
    );
    return result.rows[0];
  },

  // Update user
  // BACKWARD COMPATIBLE: accepts both camelCase and snake_case
  update: async (id, userData) => {
    const username = userData.username;
    const firstName = userData.first_name || userData.firstName;
    const lastName = userData.last_name || userData.lastName;

    const result = await query(
      `UPDATE users
       SET username = COALESCE($2, username),
           first_name = COALESCE($3, first_name),
           last_name = COALESCE($4, last_name),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at`,
      [id, username, firstName, lastName]
    );
    return result.rows[0];
  },

  // Update user role
  updateRole: async (userId, role) => {
    const result = await query(
      `UPDATE users
       SET selected_role = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, telegram_id, username, first_name, last_name, selected_role, created_at, updated_at`,
      [userId, role]
    );
    return result.rows[0];
  },

  // Update user language preference
  updateLanguage: async (userId, language) => {
    const result = await query(
      `UPDATE users
       SET language = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, telegram_id, username, first_name, last_name, selected_role, language, created_at, updated_at`,
      [userId, language]
    );
    return result.rows[0];
  },

  // Get user language preference
  getLanguage: async (userId) => {
    const result = await query(
      'SELECT language FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.language || 'ru';
  },

  // Mark onboarding as completed
  markOnboardingCompleted: async (userId) => {
    const result = await query(
      `UPDATE users
       SET onboarding_completed = true,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, telegram_id, username, first_name, last_name, selected_role, language, onboarding_completed, created_at, updated_at`,
      [userId]
    );
    return result.rows[0];
  },
};

export default userQueries;
