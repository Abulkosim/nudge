import { useState, type ChangeEvent } from 'react';
import type { ItemSummaryDto, UpdateItemBody, UserDto } from '@nudge/shared';
import { failure, receiveItem, reopenItem, updateItem } from '@/api/items';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { copy } from '@/copy';
import { fromWallClock, toWallClock } from '@/lib/time';

export function Detail({
  item,
  user,
  onClose,
}: {
  item: ItemSummaryDto;
  user: UserDto;
  onClose: () => void;
}) {
  const zone = user.timezone;
  const initial = {
    what: item.what,
    from: item.fromWhom ?? '',
    expected: item.expectedOn ?? '',
    remind: item.remindAt && zone ? toWallClock(item.remindAt, zone) : '',
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changes: UpdateItemBody = {};
  if (form.what.trim() !== initial.what.trim()) changes.what = form.what.trim();
  if (form.from.trim() !== initial.from.trim())
    changes.fromWhom = form.from.trim() || null;
  if (form.expected !== initial.expected)
    changes.expectedOn = form.expected || null;
  if (form.remind !== initial.remind)
    changes.remindAt =
      form.remind && zone ? fromWallClock(form.remind, zone) : null;
  const savable =
    !busy && form.what.trim() !== '' && Object.keys(changes).length > 0;
  const set =
    (field: keyof typeof form) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm({ ...form, [field]: event.target.value });
    };
  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void action().then(onClose, (reason: unknown) => {
      setError(failure(reason));
      setBusy(false);
    });
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {copy.back}
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="what">{copy.whatLabel}</Label>
        <Textarea id="what" value={form.what} onChange={set('what')} rows={3} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="from">{copy.fromLabel}</Label>
        <Input id="from" value={form.from} onChange={set('from')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expected">{copy.expectedLabel}</Label>
        <Input
          id="expected"
          type="date"
          value={form.expected}
          onChange={set('expected')}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reminder">{copy.reminderLabel}</Label>
        <Input
          id="reminder"
          type="datetime-local"
          value={form.remind}
          onChange={set('remind')}
          disabled={!zone}
          aria-describedby="reminder-zone"
        />
        <p id="reminder-zone" className="text-xs text-muted-foreground">
          {zone ? copy.timesIn(zone) : copy.setTimezoneFirst}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => run(() => updateItem(item.id, changes))}
          disabled={!savable}
        >
          {copy.save}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(() =>
              item.status === 'received'
                ? reopenItem(item.id)
                : receiveItem(item.id),
            )
          }
        >
          {item.status === 'received' ? copy.reopen : copy.received}
        </Button>
      </div>
    </div>
  );
}
