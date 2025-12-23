/**
 * Distributed Lock Utility
 * Uses PostgreSQL advisory locks for distributed locking across multiple instances
 * 
 * Advisory locks are automatically released when:
 * - The connection closes (process crash, connection timeout, etc.)
 * - The lock is explicitly released via pg_advisory_unlock
 * 
 * This prevents race conditions in multi-instance deployments (horizontal scaling, serverless, etc.)
 * 
 * IMPORTANT: The connection must remain open while holding the lock.
 * PostgreSQL releases advisory locks when the connection closes.
 */

import crypto from 'node:crypto';
import { getPool } from '../../db/connection.js';
import { oauthLogger } from '../../utils/logger.js';

/**
 * Maximum duration a lock can be held (30 seconds)
 * This prevents locks from being held indefinitely if a function hangs or takes too long
 */
const MAX_LOCK_DURATION_MS = 30000; // 30 seconds

/**
 * Create a promise that rejects after the specified timeout
 */
function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Lock operation timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Convert a string key to two PostgreSQL advisory lock integers (32-bit each)
 * PostgreSQL supports two-key advisory locks: pg_advisory_lock(key1, key2)
 * 
 * Uses SHA-256 hash for better distribution and collision resistance
 * Extracts two 32-bit signed integers from the hash
 * 
 * @param key - Unique lock key (e.g., "oauth:refresh:123:user@example.com")
 * @returns Tuple of [key1, key2] as 32-bit signed integers
 */
function keyToLockIds(key: string): [number, number] {
  const hash = crypto.createHash('sha256').update(key).digest();
  return [
    hash.readInt32BE(0),
    hash.readInt32BE(4),
  ];
}

/**
 * Acquire a distributed advisory lock
 * Returns a release function that must be called to release the lock
 * 
 * @param key - Unique lock key (e.g., "businessId:emailAddress")
 * @param timeoutMs - Maximum time to wait for lock (default: 5000ms)
 * @returns Promise<() => Promise<void>> - Release function, or null if lock acquisition failed
 */
export async function acquireLock(
  key: string,
  timeoutMs: number = 5000
): Promise<(() => Promise<void>) | null> {
  const [key1, key2] = keyToLockIds(key);
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    // Try to acquire lock with timeout
    // pg_try_advisory_lock(key1, key2) returns immediately (true if acquired, false if not)
    // We retry with exponential backoff until timeout
    const startTime = Date.now();
    let attempt = 0;
    
    while (Date.now() - startTime < timeoutMs) {
      const result = await client.query('SELECT pg_try_advisory_lock($1, $2) as acquired', [key1, key2]);
      
      if (result.rows[0].acquired === true) {
        // Lock acquired successfully
        oauthLogger.debug('Distributed lock acquired', {
          operation: 'acquire-lock',
          metadata: { key, key1, key2 }
        });
        
        // Return release function that releases lock AND releases the connection
        return async () => {
          try {
            await client.query('SELECT pg_advisory_unlock($1, $2)', [key1, key2]);
            oauthLogger.debug('Distributed lock released', {
              operation: 'release-lock',
              metadata: { key, key1, key2 }
            });
          } catch (error) {
            oauthLogger.error('Error releasing distributed lock', {
              operation: 'release-lock',
              metadata: { key, key1, key2 }
            }, error as Error);
          } finally {
            // Always release the connection back to the pool
            client.release();
          }
        };
      }
      
      // Lock not available, wait before retrying (exponential backoff)
      attempt++;
      const delay = Math.min(50 * Math.pow(1.5, attempt), 500); // Max 500ms delay
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Timeout reached
    oauthLogger.warn('Failed to acquire distributed lock (timeout)', {
      operation: 'acquire-lock',
      metadata: { key, key1, key2, timeoutMs, attempts: attempt }
    });
    client.release();
    return null;
  } catch (error) {
    oauthLogger.error('Error acquiring distributed lock', {
      operation: 'acquire-lock',
      metadata: { key, key1, key2 }
    }, error as Error);
    client.release();
    return null;
  }
}

/**
 * Execute a function with a distributed lock
 * Automatically acquires lock, executes function, and releases lock
 * 
 * The lock is held for the entire duration of the function execution.
 * If the function throws or times out, the lock is still released.
 * 
 * SAFETY: Maximum lock hold duration is enforced to prevent locks from being held indefinitely
 * if a function hangs or takes too long. The lock will be released even if the function times out.
 * 
 * @param key - Unique lock key
 * @param fn - Function to execute while holding the lock
 * @param timeoutMs - Maximum time to wait for lock acquisition (default: 5000ms)
 * @returns Promise<T> - Result of the function
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  timeoutMs: number = 5000
): Promise<T> {
  const release = await acquireLock(key, timeoutMs);
  
  if (!release) {
    throw new Error(`Failed to acquire distributed lock for key: ${key} (timeout: ${timeoutMs}ms)`);
  }
  
  try {
    // Race between the function execution and the maximum lock duration timeout
    // This ensures the lock is released even if the function hangs or takes too long
    return await Promise.race([
      fn(),
      timeoutPromise(MAX_LOCK_DURATION_MS)
    ]);
  } catch (error) {
    // Log timeout errors for debugging
    if (error instanceof Error && error.message.includes('timed out')) {
      oauthLogger.warn('Lock operation timed out, releasing lock', {
        operation: 'with-lock-timeout',
        metadata: { key, maxDurationMs: MAX_LOCK_DURATION_MS }
      });
    }
    throw error;
  } finally {
    // Always release the lock, even if the function timed out or threw an error
    await release();
  }
}

