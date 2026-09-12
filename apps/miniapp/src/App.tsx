import { useEffect, useSyncExternalStore } from 'react';
import { telegram } from '@/telegram';
import { Card, CardContent } from '@/components/ui/card';

export function App() {
  const { status } = useSyncExternalStore(
    telegram.subscribe,
    telegram.getSnapshot,
  );
  useEffect(() => {
    if (status !== 'loading') telegram.ready();
  }, [status]);

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
