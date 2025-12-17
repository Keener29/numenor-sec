/**
 * Concurrency Limiter Utility
 * Limits the number of concurrent async operations to prevent overwhelming APIs
 * 
 * Useful for:
 * - Rate limit compliance (Microsoft Graph API, Gmail API, etc.)
 * - Memory management (preventing too many concurrent requests)
 * - Network stability (avoiding bursty traffic)
 */

/**
 * Create a concurrency limiter that allows at most `limit` concurrent operations
 * 
 * @param limit - Maximum number of concurrent operations (default: 5)
 * @returns A function that wraps async operations with concurrency limiting
 * 
 * @example
 * const limit = createConcurrencyLimiter(3);
 * await Promise.allSettled(
 *   items.map(item => limit(() => processItem(item)))
 * );
 */
export function createConcurrencyLimiter(limit: number = 5) {
  const queue: Array<() => void> = [];
  let active = 0;

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = async () => {
        active++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          active--;
          if (queue.length > 0) {
            const next = queue.shift();
            if (next) next();
          }
        }
      };

      if (active < limit) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

