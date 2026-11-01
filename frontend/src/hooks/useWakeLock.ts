import { useEffect, useRef, useState, useCallback } from 'react';

export function useWakeLock(enabled: boolean = false) {
  const [isLocked, setIsLocked] = useState(false);
  const wakeLockRef = useRef<any>(null);

  const isSupported =
    typeof navigator !== 'undefined' && 'wakeLock' in navigator && (navigator as any).wakeLock !== undefined;

  const requestLock = useCallback(async (): Promise<boolean> => {
    if (isSupported) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setIsLocked(true);
        wakeLockRef.current.addEventListener('release', () => {
          setIsLocked(false);
        });
        return true;
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
        setIsLocked(false);
        return false;
      }
    }
    return false;
  }, [isSupported]);

  const releaseLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
      setIsLocked(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      requestLock();
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && enabled) {
          requestLock();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        releaseLock();
      };
    } else {
      releaseLock();
    }
  }, [enabled, requestLock, releaseLock]);

  return {
    isLocked,
    isSupported,
    requestWakeLock: requestLock,
    releaseWakeLock: releaseLock,
  };
}
