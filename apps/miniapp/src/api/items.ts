import { useCallback, useEffect, useState } from 'react';
import {
  ItemListDto,
  ItemSummaryDto,
  UserDto,
  type UpdateItemBody,
} from '@nudge/shared';
import { apiFetch } from '@/api/client';
import { copy } from '@/copy';

export type ListStatus = 'open' | 'received';

const sending = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const listItems = (status: ListStatus) =>
  apiFetch(`/api/items?status=${status}`, ItemListDto);
export const updateItem = (id: string, changes: UpdateItemBody) =>
  apiFetch(`/api/items/${id}`, ItemSummaryDto, {
    method: 'PATCH',
    ...sending(changes),
  });
export const receiveItem = (id: string) =>
  apiFetch(`/api/items/${id}/receive`, ItemSummaryDto, { method: 'POST' });
export const reopenItem = (id: string) =>
  apiFetch(`/api/items/${id}/reopen`, ItemSummaryDto, { method: 'POST' });
export const updateMe = (timezone: string) =>
  apiFetch('/api/me', UserDto, { method: 'PATCH', ...sending({ timezone }) });

export const failure = (error: unknown) =>
  error instanceof Error && error.message ? error.message : copy.failed;

interface Loaded {
  key: string;
  items: ItemSummaryDto[];
  error: string | null;
}

// The result carries the request it answers, so a tab change or a reload reads as loading
// without writing state on the way in.
export function useItems(status: ListStatus) {
  const [reloads, setReloads] = useState(0);
  const key = `${status}:${reloads}`;
  const [loaded, setLoaded] = useState<Loaded>({
    key: '',
    items: [],
    error: null,
  });
  useEffect(() => {
    let active = true;
    void listItems(status).then(
      (list) => {
        if (active) setLoaded({ key, items: list.items, error: null });
      },
      (error: unknown) => {
        if (active) setLoaded({ key, items: [], error: failure(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [status, key]);
  const loading = loaded.key !== key;
  return {
    items: loading ? [] : loaded.items,
    error: loading ? null : loaded.error,
    loading,
    reload: useCallback(() => setReloads((count) => count + 1), []),
  };
}
