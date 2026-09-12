import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { UserDto } from '@nudge/shared';
import { apiFetch } from '@/api/client';
import { telegram } from '@/telegram';
import { Card, CardContent } from '@/components/ui/card';

export function App() {
  const { status, initData } = useSyncExternalStore(
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
  const [auth, setAuth] = useState<{ initData: string; ok: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (status !== 'ready' || !initData) return;
    // Reuse the request across StrictMode's effect replay and theme updates.
    if (request.current?.initData !== initData) {
      request.current = { initData, promise: apiFetch('/api/me', UserDto) };
    }
    let active = true;
    void request.current.promise.then(
      () => {
        if (active) setAuth({ initData, ok: true });
      },
      () => {
        if (active) setAuth({ initData, ok: false });
      },
    );
    return () => {
      active = false;
    };
  }, [status, initData]);

  return (
    <main className="app-frame mx-auto flex max-w-lg flex-col gap-8">
      <header className="text-lg font-semibold tracking-tight">Nudge</header>
      <Card>
        <CardContent>
          {status === 'loading' ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading...
            </p>
          ) : status === 'error' ? (
            <p role="alert" className="text-sm">
              Could not open Nudge. Close and try again.
            </p>
          ) : initData ? (
            auth?.initData !== initData ? (
              <p role="status">Signing in...</p>
            ) : auth.ok ? (
              <p role="status">Signed in.</p>
            ) : (
              <p role="alert">Could not sign in. Close and try again.</p>
            )
          ) : (
            <section aria-labelledby="coming-title" className="space-y-2">
              <h1
                id="coming-title"
                className="text-xl font-semibold tracking-tight"
              >
                Mini App coming soon.
              </h1>
              <p className="text-sm text-muted-foreground">
                Use the bot for now.
              </p>
            </section>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
