/**
 * Session Encryption Utility
 *
 * Provides AES-256-GCM encryption for sensitive session fields.
 * Used to protect JWT tokens and user data stored in Redis.
 *
 * Security notes:
 * - Uses PBKDF2 for key derivation (100k iterations)
 * - Random IV and salt per encryption (no IV reuse)
 * - GCM mode provides authentication (tamper detection)
 * - Backward compatible: detects plaintext and encrypts on save
 */

import crypto from 'crypto';
import logger from './logger.js';

/**
 * Get encryption key from environment
 * Read dynamically to support testing and key rotation
 */
function getEncryptionKey() {
  // Try env var first (for testing), then config
  return process.env.SESSION_ENCRYPTION_KEY || null;
}

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const ENCRYPTED_PREFIX = '$ENC$'; // Marker to detect encrypted data

/**
 * Derive encryption key from password using PBKDF2
 * @param {string} password - Encryption key from env
 * @param {Buffer} salt - Random salt
 * @returns {Buffer} Derived key
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a string value
 * @param {string} plaintext - Value to encrypt
 * @returns {string|null} Encrypted value with prefix, or null if encryption disabled
 */
export function encrypt(plaintext) {
  const encryptionKey = getEncryptionKey();

  // If no encryption key configured, return plaintext (backward compatibility)
  if (!encryptionKey) {
    return plaintext;
  }

  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key from password
    const key = deriveKey(encryptionKey, salt);

    // Create cipher and encrypt
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Combine: salt + iv + authTag + encrypted
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    // Return with prefix for detection
    return ENCRYPTED_PREFIX + combined.toString('base64');
  } catch (error) {
    logger.error('Session encryption failed', { error: error.message });
    return plaintext; // Fallback to plaintext on error
  }
}

/**
 * Decrypt an encrypted string value
 * @param {string} ciphertext - Encrypted value with prefix
 * @returns {string|null} Decrypted value, or null if decryption fails
 */
export function decrypt(ciphertext) {
  const encryptionKey = getEncryptionKey();

  // If not encrypted (no prefix), return as-is
  if (!isEncrypted(ciphertext)) {
    return ciphertext;
  }

  // If no encryption key but data is encrypted, we can't decrypt
  if (!encryptionKey) {
    logger.warn('Encrypted session data found but no encryption key configured');
    return null;
  }

  try {
    // Remove prefix and decode
    const combined = Buffer.from(ciphertext.slice(ENCRYPTED_PREFIX.length), 'base64');

    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive key from password
    const key = deriveKey(encryptionKey, salt);

    // Create decipher and decrypt
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    logger.error('Session decryption failed', { error: error.message });
    return null; // Return null to trigger re-auth
  }
}

/**
 * Check if a value is encrypted
 * @param {string} value - Value to check
 * @returns {boolean} True if encrypted
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypt sensitive fields in session object
 * Fields to encrypt: token, user (contains PII)
 *
 * @param {Object} session - Session object
 * @returns {Object} Session with encrypted sensitive fields
 */
export function encryptSensitiveFields(session) {
  if (!session || !getEncryptionKey()) {
    return session;
  }

  const encrypted = { ...session };

  // Encrypt token if present and not already encrypted
  if (encrypted.token && !isEncrypted(encrypted.token)) {
    encrypted.token = encrypt(encrypted.token);
  }

  // Encrypt user object if present and not already encrypted
  if (encrypted.user && typeof encrypted.user === 'object') {
    const userJson = JSON.stringify(encrypted.user);
    if (!isEncrypted(userJson)) {
      encrypted.user = encrypt(userJson);
    }
  }

  return encrypted;
}

/**
 * Decrypt sensitive fields in session object
 *
 * @param {Object} session - Session object with potentially encrypted fields
 * @returns {Object} Session with decrypted sensitive fields
 */
export function decryptSensitiveFields(session) {
  if (!session) {
    return session;
  }

  const decrypted = { ...session };

  // Decrypt token if encrypted
  if (decrypted.token && isEncrypted(decrypted.token)) {
    const plainToken = decrypt(decrypted.token);
    if (plainToken === null) {
      // Decryption failed - clear token to trigger re-auth
      decrypted.token = null;
      logger.warn('Token decryption failed, will re-authenticate');
    } else {
      decrypted.token = plainToken;
    }
  }

  // Decrypt user if encrypted
  if (decrypted.user && typeof decrypted.user === 'string' && isEncrypted(decrypted.user)) {
    const plainUser = decrypt(decrypted.user);
    if (plainUser === null) {
      // Decryption failed - clear user to trigger re-auth
      decrypted.user = null;
      logger.warn('User data decryption failed, will re-authenticate');
    } else {
      try {
        decrypted.user = JSON.parse(plainUser);
      } catch {
        decrypted.user = null;
      }
    }
  }

  return decrypted;
}

export default {
  encrypt,
  decrypt,
  isEncrypted,
  encryptSensitiveFields,
  decryptSensitiveFields,
};
