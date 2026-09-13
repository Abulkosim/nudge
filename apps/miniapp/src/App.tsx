import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { UserDto } from '@nudge/shared';
import { apiFetch } from '@/api/client';
import type { ListStatus } from '@/api/items';
import { telegram } from '@/telegram';
import { Card, CardContent } from '@/components/ui/card';
import { Toaster } from '@/components/ui/sonner';
import { copy } from '@/copy';
import { List } from '@/screens/List';

// The URL hash belongs to Telegram's launch data, so the tab is remembered per session instead.
const tabKey = 'nudge.tab';
function rememberedTab(): ListStatus {
  try {
    return sessionStorage.getItem(tabKey) === 'received' ? 'received' : 'open';
  } catch {
    return 'open';
  }
}
function rememberTab(tab: ListStatus) {
  try {
    sessionStorage.setItem(tabKey, tab);
  } catch {
    // Storage can be unavailable. The tab still switches for this render.
  }
}

export function App() {
  const { status, initData, colourScheme } = useSyncExternalStore(
    telegram.subscribe,
    telegram.getSnapshot,
  );
  useEffect(() => {
    if (status !== 'loading') telegram.ready();
  }, [status]);

  const request = useRef<{
    initData: string;
    promise: Promise<UserDto>;
  } | null>(null);
  const [auth, setAuth] = useState<{
    initData: string;
    user: UserDto | null;
  } | null>(null);
  useEffect(() => {
    if (status !== 'ready' || !initData) return;
    // Reuse the request across StrictMode's effect replay and theme updates.
    if (request.current?.initData !== initData) {
      request.current = { initData, promise: apiFetch('/api/me', UserDto) };
    }
    let active = true;
    void request.current.promise.then(
      (user) => {
        if (active) setAuth({ initData, user });
      },
      () => {
        if (active) setAuth({ initData, user: null });
      },
    );
    return () => {
      active = false;
    };
  }, [status, initData]);

  const [tab, setTab] = useState<ListStatus>(rememberedTab);
  const user = auth?.initData === initData ? auth.user : null;

  if (user) {
    return (
      <main className="app-frame mx-auto flex max-w-lg flex-col gap-4">
        <header className="text-lg font-semibold tracking-tight">
          {copy.title}
        </header>
        <List
          user={user}
          onUser={(next) => setAuth({ initData, user: next })}
          tab={tab}
          onTab={(next) => {
            setTab(next);
            rememberTab(next);
          }}
        />
        <Toaster position="top-center" theme={colourScheme} />
      </main>
    );
  }
  return (
    <main className="app-frame mx-auto flex max-w-lg flex-col gap-8">
      <header className="text-lg font-semibold tracking-tight">
        {copy.title}
      </header>
      <Card>
        <CardContent>
          {status === 'loading' ? (
            <p role="status" className="text-sm text-muted-foreground">
              {copy.loading}
            </p>
          ) : status === 'error' ? (
            <p role="alert" className="text-sm">
              {copy.openFailed}
            </p>
          ) : initData ? (
            auth?.initData !== initData ? (
              <p role="status">{copy.signingIn}</p>
            ) : (
              <p role="alert">{copy.signInFailed}</p>
            )
          ) : (
            <section aria-labelledby="coming-title" className="space-y-2">
              <h1
                id="coming-title"
                className="text-xl font-semibold tracking-tight"
              >
                {copy.comingSoon}
              </h1>
              <p className="text-sm text-muted-foreground">{copy.useTheBot}</p>
            </section>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
