import { useMemo, memo } from 'react';
import { useGlobalTimer } from '../../hooks/useGlobalTimer';

/**
 * Live countdown timer for temporary discounts
 *
 * @param {string} expiresAt - ISO timestamp when discount expires
 * @returns {JSX.Element|null} - Timer with color coding
 *
 * Color coding:
 * - Orange (>3 hours): calm color
 * - Red (1-3 hours): more vibrant
 * - Red + pulse (<1 hour): urgency
 *
 * Performance: Uses global timer (single setInterval for all instances)
 */
const CountdownTimer = memo(function CountdownTimer({ expiresAt }) {
  // Subscribe to global 1-second timer (shared across all countdown instances)
  const tick = useGlobalTimer();

  // Recalculate time left on each tick
  const timeLeft = useMemo(() => {
    if (!expiresAt) return null;

    const now = new Date();
    const end = new Date(expiresAt);
    const diff = end - now; // milliseconds

    // If time expired - hide timer
    if (diff <= 0) {
      return null;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      hours,
      minutes,
      seconds,
      totalHours: diff / (1000 * 60 * 60), // for color coding
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is intentionally used to force recalculation
  }, [expiresAt, tick]);

  // If time expired or no data - don't show
  if (!timeLeft) return null;

  // Format output
  let displayText = '';
  if (timeLeft.hours > 0) {
    displayText = `${timeLeft.hours}h ${timeLeft.minutes}m`;
  } else if (timeLeft.minutes > 0) {
    displayText = `${timeLeft.minutes}m ${timeLeft.seconds}s`;
  } else {
    displayText = `${timeLeft.seconds}s`;
  }

  // Color coding and pulsing
  const isUrgent = timeLeft.totalHours < 1; // <1 hour - red + pulse
  const isWarning = timeLeft.totalHours >= 1 && timeLeft.totalHours < 3; // 1-3 hours - red
  // Note: isNormal = timeLeft.totalHours >= 3 (>3 hours - orange)

  let colorClass = 'text-orange-500';
  if (isWarning || isUrgent) {
    colorClass = 'text-red-500';
  }

  return (
    <div
      className={`flex items-center gap-1 text-xs font-semibold ${colorClass} ${
        isUrgent ? 'animate-pulse' : ''
      }`}
      aria-label={`Discount expires in ${displayText}`}
      role="timer"
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2.5}
      >
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
      </svg>
      <span style={{ letterSpacing: '0.02em' }}>{displayText}</span>
    </div>
  );
});

export default CountdownTimer;
