import { useState } from 'react';
import type { UserDto } from '@nudge/shared';
import { failure, updateMe } from '@/api/items';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';
import { deviceZone } from '@/lib/time';

const kept = 'nudge.keep-timezone';
const remember = () => {
  try {
    sessionStorage.setItem(kept, '1');
  } catch {
    // A blocked session store only means the banner comes back on the next launch.
  }
};
const wasKept = () => {
  try {
    return sessionStorage.getItem(kept) !== null;
  } catch {
    return false;
  }
};

export function TimezoneBanner({
  user,
  onUser,
}: {
  user: UserDto;
  onUser: (user: UserDto) => void;
}) {
  const [hidden, setHidden] = useState(wasKept);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const device = deviceZone();
  if (hidden || !device || device === user.timezone) return null;
  const use = () => {
    setBusy(true);
    setError(null);
    void updateMe(device).then(
      (updated) => onUser(updated),
      (reason: unknown) => {
        setError(failure(reason));
        setBusy(false);
      },
    );
  };
  const keep = () => {
    remember();
    setHidden(true);
  };
  return (
    <section className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-muted px-3 py-2 text-sm">
      <p className="min-w-0">
        {user.timezone ? copy.deviceTimezone(device) : copy.askTimezone(device)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={use} disabled={busy}>
          {copy.useTimezone(device)}
        </Button>
        {user.timezone ? (
          <Button size="sm" variant="ghost" onClick={keep} disabled={busy}>
            {copy.keepTimezone(user.timezone)}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="w-full text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
