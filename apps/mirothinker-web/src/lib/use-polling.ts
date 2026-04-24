// Polling hook for fallback when SSE is unavailable

import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePollingOptions<T> {
  fetcher: () => Promise<T>;
  interval?: number;
  enabled?: boolean;
  shouldStop?: (data: T) => boolean;
  onUpdate?: (data: T) => void;
}

export function usePolling<T>({
  fetcher,
  interval = 3000,
  enabled = true,
  shouldStop,
  onUpdate,
}: UsePollingOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    if (!mountedRef.current || !enabled) return;
    try {
      const result = await fetcher();
      if (!mountedRef.current) return;
      setData(result);
      setError(null);
      onUpdate?.(result);
      if (shouldStop?.(result)) return;
      timeoutRef.current = setTimeout(poll, interval);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err as Error);
      timeoutRef.current = setTimeout(poll, interval);
    }
  }, [fetcher, interval, enabled, shouldStop, onUpdate]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) poll();
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, poll]);

  return { data, error };
}
