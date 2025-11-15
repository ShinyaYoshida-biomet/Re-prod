import { useCallback, useEffect, useRef } from 'react';

export function useAITimeout() {
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutRef = useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  }, []);

  const startTimeout = useCallback(
    (callback: () => void, delay: number) => {
      clearTimeoutRef();
      timeoutIdRef.current = setTimeout(callback, delay);
    },
    [clearTimeoutRef],
  );

  useEffect(
    () => () => {
      clearTimeoutRef();
    },
    [clearTimeoutRef],
  );

  return { clearTimeoutRef, startTimeout };
}
