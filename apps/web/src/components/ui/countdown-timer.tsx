'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';

interface CountdownTimerProps {
  deadline: Date | string;
  onExpire?: () => void;
  showLabel?: boolean;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  totalSeconds: number;
}

function calculateTimeRemaining(deadline: Date | string): TimeRemaining {
  const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const now = new Date();
  const diff = deadlineDate.getTime() - now.getTime();

  if (diff <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      totalSeconds: 0,
    };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
    totalSeconds,
  };
}

export function CountdownTimer({
  deadline,
  onExpire,
  showLabel = true,
}: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(
    calculateTimeRemaining(deadline)
  );

  // Memoized callback to prevent re-renders on every interval tick
  const updateTime = useCallback(() => {
    const newTime = calculateTimeRemaining(deadline);
    setTimeRemaining(newTime);

    // Call onExpire only when transitioning to expired state
    if (newTime.isExpired && !timeRemaining.isExpired && onExpire) {
      onExpire();
    }
  }, [deadline, timeRemaining.isExpired, onExpire]);

  // Effect: set up interval, cleanup on unmount or deadline change
  useEffect(() => {
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [updateTime]);

  // Memoized styling based on time remaining
  const { colorClass, bgClass } = useMemo(() => {
    if (timeRemaining.isExpired) {
      return {
        colorClass: 'text-destructive font-bold',
        bgClass: 'bg-destructive/10',
      };
    }

    if (timeRemaining.totalSeconds < 3600) {
      // < 1 hour
      return {
        colorClass: 'text-destructive font-bold',
        bgClass: 'bg-destructive/10',
      };
    }

    if (timeRemaining.totalSeconds < 86400) {
      // < 24 hours
      return {
        colorClass: 'text-amber-600',
        bgClass: 'bg-amber-50',
      };
    }

    // > 24 hours
    return {
      colorClass: 'text-foreground',
      bgClass: 'bg-transparent',
    };
  }, [timeRemaining.totalSeconds, timeRemaining.isExpired]);

  if (timeRemaining.isExpired) {
    return (
      <div
        className={`inline-block px-3 py-1.5 rounded text-sm font-semibold ${colorClass} ${bgClass}`}
      >
        Süre Dolmuş
      </div>
    );
  }

  return (
    <div
      className={`inline-block px-3 py-1.5 rounded text-sm font-semibold ${colorClass} ${bgClass}`}
    >
      {showLabel ? (
        <>
          {timeRemaining.days > 0 && (
            <span>
              {timeRemaining.days} Gün {timeRemaining.hours} Saat{' '}
              {timeRemaining.minutes} Dakika
            </span>
          )}
          {timeRemaining.days === 0 && timeRemaining.hours > 0 && (
            <span>
              {timeRemaining.hours} Saat {timeRemaining.minutes} Dakika{' '}
              {timeRemaining.seconds} Saniye
            </span>
          )}
          {timeRemaining.days === 0 && timeRemaining.hours === 0 && (
            <span>
              {timeRemaining.minutes} Dakika {timeRemaining.seconds} Saniye
            </span>
          )}
        </>
      ) : (
        <span>
          {timeRemaining.days}g {timeRemaining.hours}s {timeRemaining.minutes}d
        </span>
      )}
    </div>
  );
}
