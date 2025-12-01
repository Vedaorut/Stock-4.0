/**
 * Session Crypto Tests
 *
 * Tests for AES-256-GCM encryption of sensitive session fields.
 */

// Set encryption key before importing
process.env.SESSION_ENCRYPTION_KEY = 'test-encryption-key-32-chars-long!';

import { encrypt, decrypt, isEncrypted, encryptSensitiveFields, decryptSensitiveFields } from '../../src/utils/sessionCrypto.js';

describe('Session Crypto', () => {
  // Store original key
  const originalKey = process.env.SESSION_ENCRYPTION_KEY;

  afterAll(() => {
    // Restore original key
    process.env.SESSION_ENCRYPTION_KEY = originalKey;
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plaintext = 'my-secret-jwt-token';
      const encrypted = encrypt(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(isEncrypted(encrypted)).toBe(true);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'same-token';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2); // Different due to random IV/salt
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'Привет мир! 🔐 こんにちは';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle JSON-like strings', () => {
      const plaintext = JSON.stringify({ userId: 123, role: 'seller' });
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(JSON.parse(decrypted)).toEqual({ userId: 123, role: 'seller' });
    });
  });

  describe('isEncrypted', () => {
    it('should detect encrypted strings', () => {
      const encrypted = encrypt('test');
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plaintext', () => {
      expect(isEncrypted('plain-text')).toBe(false);
      expect(isEncrypted('jwt.token.here')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
      expect(isEncrypted(123)).toBe(false);
      expect(isEncrypted({})).toBe(false);
    });
  });

  describe('encryptSensitiveFields', () => {
    it('should encrypt token field', () => {
      const session = {
        token: 'my-jwt-token',
        shopId: 123,
        role: 'seller',
      };

      const encrypted = encryptSensitiveFields(session);

      expect(isEncrypted(encrypted.token)).toBe(true);
      expect(encrypted.shopId).toBe(123); // Not encrypted
      expect(encrypted.role).toBe('seller'); // Not encrypted
    });

    it('should encrypt user object as JSON', () => {
      const session = {
        token: 'my-jwt-token',
        user: { id: 1, username: 'test', firstName: 'Test' },
      };

      const encrypted = encryptSensitiveFields(session);

      expect(isEncrypted(encrypted.token)).toBe(true);
      expect(typeof encrypted.user).toBe('string');
      expect(isEncrypted(encrypted.user)).toBe(true);
    });

    it('should not double-encrypt already encrypted fields', () => {
      const session = {
        token: 'my-jwt-token',
      };

      const encrypted1 = encryptSensitiveFields(session);
      const encrypted2 = encryptSensitiveFields(encrypted1);

      // Should be the same (no double encryption)
      expect(encrypted1.token).toBe(encrypted2.token);
    });

    it('should handle null/undefined session', () => {
      expect(encryptSensitiveFields(null)).toBe(null);
      expect(encryptSensitiveFields(undefined)).toBe(undefined);
    });

    it('should preserve other session fields', () => {
      const session = {
        token: 'jwt',
        shopId: 123,
        role: 'seller',
        lastActionTime: Date.now(),
        wizard: { state: { step: 1 } },
      };

      const encrypted = encryptSensitiveFields(session);

      expect(encrypted.shopId).toBe(session.shopId);
      expect(encrypted.role).toBe(session.role);
      expect(encrypted.lastActionTime).toBe(session.lastActionTime);
      expect(encrypted.wizard).toEqual(session.wizard);
    });
  });

  describe('decryptSensitiveFields', () => {
    it('should decrypt token field', () => {
      const original = {
        token: 'my-jwt-token',
        shopId: 123,
      };

      const encrypted = encryptSensitiveFields(original);
      const decrypted = decryptSensitiveFields(encrypted);

      expect(decrypted.token).toBe('my-jwt-token');
      expect(decrypted.shopId).toBe(123);
    });

    it('should decrypt user object back to object', () => {
      const original = {
        user: { id: 1, username: 'test' },
      };

      const encrypted = encryptSensitiveFields(original);
      const decrypted = decryptSensitiveFields(encrypted);

      expect(decrypted.user).toEqual({ id: 1, username: 'test' });
    });

    it('should handle plaintext (backward compatibility)', () => {
      const plaintext = {
        token: 'plaintext-jwt-token',
        user: { id: 1 },
        shopId: 123,
      };

      const decrypted = decryptSensitiveFields(plaintext);

      expect(decrypted.token).toBe('plaintext-jwt-token');
      expect(decrypted.user).toEqual({ id: 1 });
    });

    it('should handle null/undefined session', () => {
      expect(decryptSensitiveFields(null)).toBe(null);
      expect(decryptSensitiveFields(undefined)).toBe(undefined);
    });
  });

  describe('security properties', () => {
    it('should detect tampered ciphertext (GCM authentication)', () => {
      const encrypted = encrypt('secret');

      // Tamper with the ciphertext (change a character)
      const tampered = encrypted.slice(0, -5) + 'XXXXX';

      const decrypted = decrypt(tampered);
      expect(decrypted).toBe(null); // Should fail authentication
    });

    it('should not leak plaintext in encrypted output', () => {
      const secret = 'super-secret-token-12345';
      const encrypted = encrypt(secret);

      expect(encrypted).not.toContain(secret);
      expect(encrypted).not.toContain('secret');
      expect(encrypted).not.toContain('token');
    });
  });
});
