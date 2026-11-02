// useResource (F1.16): общий экран «загрузка / ошибка / готово» вынесен в ui.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useResource } from '../src/ui/index.ts';

describe('useResource', () => {
  it('сначала загрузка, потом данные', async () => {
    const { result } = renderHook(() => useResource(async () => 'готово'));
    expect(result.current).toMatchObject({ data: undefined, loading: true, error: undefined });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe('готово');
    expect(result.current.error).toBeUndefined();
  });

  it('ошибка загрузки сохраняется в error, данных нет; reload() повторяет и снимает ошибку', async () => {
    let fail = true;
    const { result } = renderHook(() =>
      useResource(async () => {
        if (fail) throw new Error('нет связи');
        return 7;
      }),
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.data).toBeUndefined();
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe(7));
    expect(result.current.error).toBeUndefined();
  });

  it('при повторной загрузке прежние данные остаются; смена deps перезагружает', async () => {
    let n = 0;
    const { result, rerender } = renderHook(
      ({ key }) => useResource(async () => `${key}-${++n}`, [key]),
      {
        initialProps: { key: 'a' },
      },
    );
    await waitFor(() => expect(result.current.data).toBe('a-1'));
    rerender({ key: 'b' });
    expect(result.current.data).toBe('a-1'); // пока грузится новое, старое на экране
    await waitFor(() => expect(result.current.data).toBe('b-2'));
  });
});
