import { useState, useEffect, useRef, memo } from 'react';

/**
 * Live countdown timer для временных скидок
 *
 * @param {string} expiresAt - ISO timestamp когда истекает скидка
 * @returns {JSX.Element|null} - Таймер с цветовым кодированием
 *
 * Цветовое кодирование:
 * - Оранжевый (>3 часа): спокойный цвет
 * - Красный (1-3 часа): более яркий
 * - Красный + пульсация (<1 час): срочность
 */
const CountdownTimer = memo(function CountdownTimer({ expiresAt }) {
  const [timeLeft, setTimeLeft] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Set mounted flag
    isMountedRef.current = true;

    // Валидация входных данных
    if (!expiresAt) return;

    const calculateTimeLeft = () => {
      const now = new Date();
      const end = new Date(expiresAt);
      const diff = end - now; // миллисекунды

      // Check if component is still mounted before updating state
      if (!isMountedRef.current) {
        return;
      }

      // Если время истекло - скрыть таймер
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setTimeLeft({
        hours,
        minutes,
        seconds,
        totalHours: diff / (1000 * 60 * 60), // для цветового кодирования
      });
    };

    // Начальный расчёт
    calculateTimeLeft();

    // Обновление каждую секунду
    const interval = setInterval(calculateTimeLeft, 1000);

    // Cleanup при unmount
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [expiresAt]);

  // Если время истекло или данных нет - не показывать
  if (!timeLeft) return null;

  // Форматирование вывода
  let displayText = '';
  if (timeLeft.hours > 0) {
    displayText = `${timeLeft.hours}ч ${timeLeft.minutes}м`;
  } else if (timeLeft.minutes > 0) {
    displayText = `${timeLeft.minutes}м ${timeLeft.seconds}с`;
  } else {
    displayText = `${timeLeft.seconds}с`;
  }

  // Цветовое кодирование и пульсация
  const isUrgent = timeLeft.totalHours < 1; // <1 час - красный + пульсация
  const isWarning = timeLeft.totalHours >= 1 && timeLeft.totalHours < 3; // 1-3 часа - красный
  // Note: isNormal = timeLeft.totalHours >= 3 (>3 часа - оранжевый)

  let colorClass = 'text-orange-500';
  if (isWarning || isUrgent) {
    colorClass = 'text-red-500';
  }

  return (
    <div
      className={`flex items-center gap-1 text-xs font-semibold ${colorClass} ${
        isUrgent ? 'animate-pulse' : ''
      }`}
      aria-label={`Скидка истекает через ${displayText}`}
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
