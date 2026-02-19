import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * React Hook für async API-Aufrufe mit Loading/Error/Data State.
 * Automatisches Cleanup bei Unmount (keine setState auf unmounted Component).
 */
export function useApi<T>(
  apiFn: () => Promise<T>,
  deps: any[] = [],
  options?: { enabled?: boolean; initialData?: T },
) {
  const [data, setData] = useState<T | undefined>(options?.initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFn();
      if (mountedRef.current) {
        setData(result);
      }
      return result;
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message || String(err));
      }
      return undefined;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    if (options?.enabled !== false) {
      execute();
    }
    return () => {
      mountedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute, options?.enabled]);

  return { data, loading, error, refetch: execute };
}

/**
 * Hook für Polling mit automatischem Cleanup.
 */
export function useInterval(callback: () => void, delayMs: number | null) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (delayMs === null) return;
    const id = setInterval(() => callbackRef.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}
