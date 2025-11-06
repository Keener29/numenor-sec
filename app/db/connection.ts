import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { getDatabaseConfig } from './config.js';
import { logger } from '../api/services/logger.js';

// A pool is a collection of connections to the database that can be reused and does not waste time creating a new connection each time.

// Initializes a database connection pool
// Provides a function to get a pool instance
// Handles pool errors
// Exports query function for executing SQL
// Provides a function to get a client for direct connection
// Closes the pool on SIGINT and SIGTERM
// Gracefully shuts down the application

let pool: Pool | null = null;

export const getPool = (): Pool => {
  if (!pool) {
    const config = getDatabaseConfig();
    pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    });

    // Handle pool errors
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', {
        operation: 'database-pool-error'
      }, err as Error);
      process.exit(-1);
    });
  }

  return pool;
};

export const query = async (text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }> => {
  const pool = getPool();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    logger.error('Database query error', {
      operation: 'database-query',
      metadata: {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      }
    }, error as Error);
    throw error;
  }
};

export const getClient = async (): Promise<PoolClient> => {
  const pool = getPool();
  return await pool.connect();
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing database pool', {
    operation: 'database-shutdown'
  });
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing database pool', {
    operation: 'database-shutdown'
  });
  await closePool();
  process.exit(0);
});
