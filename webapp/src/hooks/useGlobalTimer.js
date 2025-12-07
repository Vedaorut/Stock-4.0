import { useEffect, useState } from 'react';

/**
 * Global Timer - single interval shared across all countdown components
 *
 * Problem: 50 products with discounts = 50 setInterval instances
 * Solution: One global timer, multiple listeners
 *
 * Usage:
 *   const tick = useGlobalTimer();
 *   // tick increments every second, use it as dependency to recalculate
 */

// Module-level state (singleton pattern)
let globalTick = 0;
let listeners = new Set();
let intervalId = null;

function startGlobalTimer() {
  if (intervalId) return;

  intervalId = setInterval(() => {
    globalTick++;
    listeners.forEach(listener => listener(globalTick));
  }, 1000);
}

function stopGlobalTimer() {
  if (listeners.size === 0 && intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    globalTick = 0;
  }
}

/**
 * Subscribe to global 1-second timer
 * @returns {number} Current tick count (increments every second)
 */
export function useGlobalTimer() {
  const [tick, setTick] = useState(globalTick);

  useEffect(() => {
    listeners.add(setTick);
    startGlobalTimer();

    return () => {
      listeners.delete(setTick);
      stopGlobalTimer();
    };
  }, []);

  return tick;
}

export default useGlobalTimer;
