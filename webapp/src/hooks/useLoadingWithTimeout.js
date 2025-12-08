import { useState, useEffect, useCallback } from 'react';

/**
 * Loading state hook with automatic timeout
 * Prevents infinite loading spinners
 *
 * @param {number} timeoutMs - Timeout in milliseconds (default: 15000)
 * @returns {[boolean, function, boolean, function]} - [isLoading, setLoading, hasTimedOut, resetTimeout]
 */
export function useLoadingWithTimeout(timeoutMs = 15000) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setHasTimedOut(false);
      return;
    }

    const timeout = setTimeout(() => {
      setHasTimedOut(true);
      setIsLoading(false);
    }, timeoutMs);

    return () => clearTimeout(timeout);
  }, [isLoading, timeoutMs]);

  const setLoading = useCallback((value) => {
    if (!value) setHasTimedOut(false);
    setIsLoading(value);
  }, []);

  const resetTimeout = useCallback(() => {
    setHasTimedOut(false);
    setIsLoading(false);
  }, []);

  return [isLoading, setLoading, hasTimedOut, resetTimeout];
}

export default useLoadingWithTimeout;
