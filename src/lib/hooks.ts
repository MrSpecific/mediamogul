import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiError } from "./api";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (d: T | null) => void;
}

/** Minimal data-fetching hook. Pass `null` to skip fetching. */
export function useApiData<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (path === null) return;
    setLoading(true);
    apiGet<T>(path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
