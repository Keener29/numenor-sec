/**
 * Database Connection Tests
 * Tests database connection initialization and error handling
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import { query } from '../connection.js';
import { logger } from '../../api/services/logger.js';

// Mock pg Pool
jest.mock('pg', () => ({
  Pool: jest.fn()
}));

jest.mock('../../api/services/logger.js', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../config.js', () => ({
  getDatabaseConfig: jest.fn().mockReturnValue({
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'testuser',
    password: 'testpass',
    ssl: false
  })
}));

describe('query', () => {
  let mockPool: Partial<Pool>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = {
      query: jest.fn() as any,
      on: jest.fn() as any
    };
    (mockPool.query as any).mockResolvedValue({ rows: [], rowCount: 0 });
    (Pool as any).mockImplementation(() => mockPool);
  });

  it('should log error and rethrow on query failure', async () => {
    const queryError = new Error('Database query failed');
    (mockPool.query as any).mockRejectedValue(queryError);

    await expect(query('SELECT * FROM users', [])).rejects.toThrow('Database query failed');

    expect(logger.error).toHaveBeenCalledWith(
      'Database query error',
      {
        operation: 'database-query',
        metadata: {
          query: 'SELECT * FROM users'
        }
      },
      queryError
    );
  });
});
