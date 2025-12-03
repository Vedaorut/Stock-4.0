import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

/**
 * Unit tests for Broadcast Service - SQL Injection Prevention
 *
 * Tests cover:
 * - updateMigrationStatus: SQL injection whitelist validation
 * - ALLOWED_MIGRATION_UPDATE_FIELDS enforcement
 * - Safe field names accepted
 * - Malicious field names rejected
 *
 * CRITICAL: All database queries and external services are mocked
 */

// Mock dependencies
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn();

jest.unstable_mockModule('../../src/config/database.js', () => ({
  default: {
    connect: mockPoolConnect,
    query: mockPoolQuery,
  },
}));

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: mockLogger,
}));

jest.unstable_mockModule('../../src/config/env.js', () => ({
  config: {
    telegram: {
      botToken: 'test-bot-token',
    },
  },
}));

jest.unstable_mockModule('../../src/i18n/index.js', () => ({
  t: jest.fn((key) => key),
  DEFAULT_LANGUAGE: 'ru',
}));

// Import mocked modules after mocking
const pool = (await import('../../src/config/database.js')).default;
const logger = (await import('../../src/utils/logger.js')).default;

const { updateMigrationStatus } = await import('../../src/services/broadcastService.js');

describe('Broadcast Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockClear();
    mockClient.release.mockClear();
    mockPoolQuery.mockClear();
    mockPoolConnect.mockResolvedValue(mockClient);

    // Default: successful query
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ============================================================================
  // updateMigrationStatus - SQL Injection Prevention (P0 CRITICAL)
  // ============================================================================
  describe('updateMigrationStatus', () => {
    describe('SQL Injection Prevention - Field Whitelist', () => {
      it('should accept all valid whitelisted fields', async () => {
        await updateMigrationStatus(1, 'processing', {
          sent_count: 10,
          failed_count: 2,
          started_at: new Date(),
          completed_at: new Date(),
        });

        const sqlCall = mockPoolQuery.mock.calls[0][0];

        // All valid fields should be present in SQL
        expect(sqlCall).toContain('sent_count = $');
        expect(sqlCall).toContain('failed_count = $');
        expect(sqlCall).toContain('started_at = $');
        expect(sqlCall).toContain('completed_at = $');
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should accept single valid field: sent_count', async () => {
        await updateMigrationStatus(1, 'processing', {
          sent_count: 5,
        });

        const sqlCall = mockPoolQuery.mock.calls[0][0];
        expect(sqlCall).toContain('sent_count = $');
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should accept single valid field: failed_count', async () => {
        await updateMigrationStatus(1, 'processing', {
          failed_count: 3,
        });

        const sqlCall = mockPoolQuery.mock.calls[0][0];
        expect(sqlCall).toContain('failed_count = $');
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should reject unknown field names with warning', async () => {
        await updateMigrationStatus(1, 'processing', {
          sent_count: 10,
          malicious_field: 'value',
        });

        expect(logger.warn).toHaveBeenCalledWith(
          '[Broadcast] Rejected invalid field in migration update',
          { field: 'malicious_field', migrationId: 1 }
        );

        const sqlCall = mockPoolQuery.mock.calls[0][0];
        expect(sqlCall).toContain('sent_count');
        expect(sqlCall).not.toContain('malicious_field');
      });

      it('should reject multiple invalid fields', async () => {
        await updateMigrationStatus(1, 'processing', {
          invalid_field_1: 'value1',
          invalid_field_2: 'value2',
        });

        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalledWith(
          '[Broadcast] Rejected invalid field in migration update',
          { field: 'invalid_field_1', migrationId: 1 }
        );
        expect(logger.warn).toHaveBeenCalledWith(
          '[Broadcast] Rejected invalid field in migration update',
          { field: 'invalid_field_2', migrationId: 1 }
        );
      });
    });

    describe('SQL Injection Prevention - Attack Vectors', () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "'; DELETE FROM channel_migrations; --",
        "1; DROP TABLE shops;--",
        "sent_count; DELETE FROM users WHERE 1=1; --",
        "1=1 OR",
        "' OR '1'='1",
        "admin'--",
        "'; TRUNCATE TABLE shops; --",
        "'; UPDATE users SET role='admin'; --",
        "UNION SELECT * FROM users--",
        "'; INSERT INTO users VALUES ('hacker', 'password'); --",
      ];

      it.each(sqlInjectionAttempts)(
        'should block SQL injection attempt: %s',
        async (maliciousField) => {
          await updateMigrationStatus(1, 'processing', {
            [maliciousField]: 'value',
          });

          expect(logger.warn).toHaveBeenCalledWith(
            '[Broadcast] Rejected invalid field in migration update',
            { field: maliciousField, migrationId: 1 }
          );

          const sqlCall = mockPoolQuery.mock.calls[0][0];
          expect(sqlCall).not.toContain(maliciousField);
          expect(sqlCall).not.toContain('DROP');
          expect(sqlCall).not.toContain('DELETE');
          expect(sqlCall).not.toContain('TRUNCATE');
          expect(sqlCall).not.toContain('INSERT INTO users');
        }
      );

      it('should not include rejected fields in SQL query', async () => {
        await updateMigrationStatus(1, 'processing', {
          sent_count: 10,
          'DROP TABLE users': 'malicious',
          failed_count: 2,
          'DELETE FROM shops': 'malicious',
        });

        const sqlCall = mockPoolQuery.mock.calls[0][0];

        // Valid fields present
        expect(sqlCall).toContain('sent_count');
        expect(sqlCall).toContain('failed_count');

        // Malicious content NOT present
        expect(sqlCall).not.toContain('DROP TABLE');
        expect(sqlCall).not.toContain('DELETE FROM');
        expect(sqlCall).not.toContain('malicious');
      });

      it('should reject prototype pollution attempts', async () => {
        const prototypePollutionAttempts = [
          '__proto__',
          'constructor',
          'prototype',
          '__defineGetter__',
          '__defineSetter__',
        ];

        for (const field of prototypePollutionAttempts) {
          jest.clearAllMocks();

          await updateMigrationStatus(1, 'processing', {
            [field]: 'value',
          });

          expect(logger.warn).toHaveBeenCalledWith(
            '[Broadcast] Rejected invalid field in migration update',
            { field, migrationId: 1 }
          );
        }
      });
    });

    describe('Parameter Binding', () => {
      it('should use parameterized queries with correct parameter order', async () => {
        await updateMigrationStatus(1, 'completed', {
          sent_count: 100,
          failed_count: 5,
        });

        const [sql, params] = mockPoolQuery.mock.calls[0];

        // Status is $1
        expect(params[0]).toBe('completed');

        // sent_count and failed_count are parameterized
        expect(params).toContain(100);
        expect(params).toContain(5);

        // Migration ID is last parameter
        expect(params[params.length - 1]).toBe(1);

        // SQL uses parameterized placeholders
        expect(sql).toMatch(/\$\d+/);
        expect(sql).not.toContain('100'); // Value not embedded in SQL
        expect(sql).not.toContain("'completed'"); // Status not embedded
      });

      it('should maintain parameter order when some fields are rejected', async () => {
        await updateMigrationStatus(2, 'processing', {
          sent_count: 50,
          invalid: 'ignored',
          failed_count: 10,
        });

        const [sql, params] = mockPoolQuery.mock.calls[0];

        // Parameters should only include valid values
        expect(params).toContain('processing'); // status
        expect(params).toContain(50); // sent_count
        expect(params).toContain(10); // failed_count
        expect(params).toContain(2); // migrationId
        expect(params).not.toContain('ignored'); // rejected field value

        // SQL should not contain invalid field
        expect(sql).not.toContain('invalid');
      });
    });

    describe('Normal Operation', () => {
      it('should update status without additional fields', async () => {
        await updateMigrationStatus(1, 'pending');

        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE channel_migrations'),
          expect.arrayContaining(['pending', 1])
        );

        expect(logger.info).toHaveBeenCalledWith(
          '[Broadcast] Updated migration 1 status to pending'
        );
      });

      it('should auto-add started_at timestamp for processing status', async () => {
        await updateMigrationStatus(1, 'processing');

        const sqlCall = mockPoolQuery.mock.calls[0][0];
        expect(sqlCall).toContain('started_at = NOW()');
      });

      it('should NOT auto-add started_at if explicitly provided', async () => {
        const customStartTime = new Date('2024-01-01');

        await updateMigrationStatus(1, 'processing', {
          started_at: customStartTime,
        });

        const sqlCall = mockPoolQuery.mock.calls[0][0];

        // Should use the parameterized value, not NOW()
        // Count occurrences of 'started_at'
        const matches = sqlCall.match(/started_at/g);
        expect(matches.length).toBe(1); // Only one occurrence

        // The value should be in params
        const params = mockPoolQuery.mock.calls[0][1];
        expect(params).toContain(customStartTime);
      });

      it('should auto-add completed_at timestamp for completed status', async () => {
        await updateMigrationStatus(1, 'completed');

        const sqlCall = mockPoolQuery.mock.calls[0][0];
        expect(sqlCall).toContain('completed_at = NOW()');
      });

      it('should auto-add completed_at timestamp for failed status', async () => {
        await updateMigrationStatus(1, 'failed');

        const sqlCall = mockPoolQuery.mock.calls[0][0];
        expect(sqlCall).toContain('completed_at = NOW()');
      });

      it('should handle empty updates object', async () => {
        await updateMigrationStatus(1, 'processing', {});

        expect(mockPoolQuery).toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should throw and log error on database failure', async () => {
        const dbError = new Error('Database connection lost');
        mockPoolQuery.mockRejectedValue(dbError);

        await expect(updateMigrationStatus(1, 'processing')).rejects.toThrow(
          'Database connection lost'
        );

        expect(logger.error).toHaveBeenCalledWith(
          '[Broadcast] Error updating migration status:',
          dbError
        );
      });

      it('should still attempt query even when all custom fields are invalid', async () => {
        await updateMigrationStatus(1, 'processing', {
          invalid1: 'value1',
          invalid2: 'value2',
        });

        // Should still execute query with just status update
        expect(mockPoolQuery).toHaveBeenCalled();

        const sqlCall = mockPoolQuery.mock.calls[0][0];
        expect(sqlCall).toContain('status = $1');
      });
    });

    describe('Edge Cases', () => {
      it('should handle field names with special characters', async () => {
        await updateMigrationStatus(1, 'processing', {
          'field-with-dash': 'value',
          'field.with.dot': 'value',
          'field with space': 'value',
          field_with_underscore: 'value', // underscore is valid char but not whitelisted
        });

        expect(logger.warn).toHaveBeenCalledTimes(4);
      });

      it('should handle numeric field names', async () => {
        await updateMigrationStatus(1, 'processing', {
          123: 'value',
          '456': 'value',
        });

        expect(logger.warn).toHaveBeenCalledTimes(2);
      });

      it('should handle null and undefined values for valid fields', async () => {
        await updateMigrationStatus(1, 'processing', {
          sent_count: null,
          failed_count: undefined,
        });

        const params = mockPoolQuery.mock.calls[0][1];

        // Values should be passed to DB (DB will handle null)
        expect(params).toContain(null);
        expect(params).toContain(undefined);
      });

      it('should handle very large numbers', async () => {
        await updateMigrationStatus(1, 'processing', {
          sent_count: Number.MAX_SAFE_INTEGER,
          failed_count: 9999999999,
        });

        const params = mockPoolQuery.mock.calls[0][1];
        expect(params).toContain(Number.MAX_SAFE_INTEGER);
        expect(params).toContain(9999999999);
      });

      it('should handle Date objects for timestamp fields', async () => {
        const testDate = new Date('2024-06-15T10:30:00Z');

        await updateMigrationStatus(1, 'processing', {
          started_at: testDate,
          completed_at: testDate,
        });

        const params = mockPoolQuery.mock.calls[0][1];
        expect(params).toContain(testDate);
      });
    });

    describe('Case Sensitivity', () => {
      it('should reject case variations of valid fields', async () => {
        await updateMigrationStatus(1, 'processing', {
          Sent_Count: 10, // PascalCase
          SENT_COUNT: 10, // UPPER
          FAILED_COUNT: 5, // UPPER
        });

        expect(logger.warn).toHaveBeenCalledTimes(3);

        const sqlCall = mockPoolQuery.mock.calls[0][0];
        expect(sqlCall).not.toContain('Sent_Count');
        expect(sqlCall).not.toContain('SENT_COUNT');
        expect(sqlCall).not.toContain('FAILED_COUNT');
      });
    });
  });
});
