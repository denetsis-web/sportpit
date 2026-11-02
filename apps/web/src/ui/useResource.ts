// Загрузка данных для экрана «загрузка / ошибка / готово»: данные приходят при показе и по `reload()`.
// При повторной загрузке прежние данные остаются на экране (`data` не сбрасывается), поэтому
// «загрузка» показывается, только пока данных ещё нет: `loading && data === undefined`.
import { useCallback, useEffect, useState } from 'react';

export interface Resource<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/** Загружает данные при показе страницы и по требованию; перезагружается при смене `deps`. */
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((value) => {
        if (!alive) return;
        setData(value);
        setError(undefined);
      })
      .catch((e: unknown) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [version, ...deps]);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return { data, error, loading, reload };
}
