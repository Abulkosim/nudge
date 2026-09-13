import { useState } from 'react';
import type { ItemSummaryDto, UpdateItemBody, UserDto } from '@nudge/shared';
import { CalendarIcon, CheckIcon, ClockIcon } from 'lucide-react';
import { failure, receiveItem, reopenItem, updateItem } from '@/api/items';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { copy } from '@/copy';
import {
  deviceZone,
  formatDateLong,
  fromCalendarDate,
  fromWallClock,
  toCalendarDate,
  today,
  toWallClock,
} from '@/lib/time';

// Half hour steps, 00:00 to 23:30, the grain the reminder field offers.
const times = Array.from({ length: 48 }, (_, index) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(index / 2))}:${index % 2 ? '30' : '00'}`;
});
const defaultTime = '09:00';

function DatePick({
  id,
  labelledBy,
  value,
  zone,
  onPick,
  onClear,
}: {
  id: string;
  labelledBy: string;
  value: string;
  zone: string;
  onPick: (date: string) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const floor = toCalendarDate(today(zone));
  const selected = value ? toCalendarDate(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          aria-labelledby={`${labelledBy} ${id}`}
          className="h-10 w-full justify-start gap-2 px-3 font-normal"
        >
          <CalendarIcon className="text-muted-foreground" />
          <span className="truncate">
            {value ? formatDateLong(value) : copy.noDate}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? floor}
          startMonth={new Date(floor.getFullYear(), floor.getMonth(), 1)}
          disabled={{ before: floor }}
          onSelect={(date) => {
            if (!date) return;
            onPick(fromCalendarDate(date));
            setOpen(false);
          }}
        />
        {onClear && value ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            {copy.clear}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function Detail({
  item,
  user,
  onDone,
}: {
  item: ItemSummaryDto;
  user: UserDto;
  onDone: (message: string) => void;
}) {
  const zone = user.timezone;
  const wall = item.remindAt && zone ? toWallClock(item.remindAt, zone) : '';
  const initial = {
    what: item.what,
    from: item.fromWhom ?? '',
    expected: item.expectedOn ?? '',
    remind: wall,
  };
  const [form, setForm] = useState(initial);
  // The reminder date and time stay filled while the switch is off, so turning it back on
  // does not lose what the user just had.
  const [remindOn, setRemindOn] = useState(
    wall.slice(0, 10) || item.expectedOn || (zone ? today(zone) : ''),
  );
  const [remindTime, setRemindTime] = useState(wall.slice(11) || defaultTime);
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

  const setRemind = (date: string, time: string) => {
    setRemindOn(date);
    setRemindTime(time);
    setForm({ ...form, remind: `${date}T${time}` });
  };
  const toggleRemind = (on: boolean) => {
    if (!on) return setForm({ ...form, remind: '' });
    const date = remindOn || form.expected || (zone ? today(zone) : '');
    setRemind(date, remindTime || defaultTime);
  };
  const run = (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    void action().then(
      () => onDone(message),
      (reason: unknown) => {
        setError(failure(reason));
        setBusy(false);
      },
    );
  };
  const on = form.remind !== '';

  return (
    <>
      <DrawerHeader className="pb-2 text-left">
        <DrawerTitle className="line-clamp-1">{item.what}</DrawerTitle>
      </DrawerHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="what">{copy.whatLabel}</Label>
          <Textarea
            id="what"
            rows={3}
            autoFocus={false}
            value={form.what}
            onChange={(event) => setForm({ ...form, what: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">{copy.fromLabel}</Label>
          <Input
            id="from"
            className="h-10"
            placeholder={copy.fromPlaceholder}
            value={form.from}
            onChange={(event) => setForm({ ...form, from: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="expected-label" htmlFor="expected">
            {copy.expectedLabel}
          </Label>
          <DatePick
            id="expected"
            labelledBy="expected-label"
            value={form.expected}
            zone={zone ?? deviceZone()}
            onPick={(date) => setForm({ ...form, expected: date })}
            onClear={() => setForm({ ...form, expected: '' })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label id="remind-label" htmlFor="remind">
              {copy.remindMe}
            </Label>
            <Switch
              id="remind"
              aria-labelledby="remind-label"
              disabled={!zone}
              checked={on}
              onCheckedChange={toggleRemind}
            />
          </div>
          {on && zone ? (
            <div className="grid grid-cols-2 gap-2">
              <span id="remind-date-label" className="sr-only">
                {copy.reminderDateLabel}
              </span>
              <DatePick
                id="remind-date"
                labelledBy="remind-date-label"
                value={remindOn}
                zone={zone}
                onPick={(date) => setRemind(date, remindTime)}
              />
              <span id="remind-time-label" className="sr-only">
                {copy.reminderTimeLabel}
              </span>
              <Select
                value={remindTime}
                onValueChange={(time) => setRemind(remindOn, time)}
              >
                <SelectTrigger
                  id="remind-time"
                  aria-labelledby="remind-time-label remind-time"
                  className="h-10 w-full px-3"
                >
                  <ClockIcon className="text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {times.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {zone ? copy.timesIn(zone) : copy.setTimezoneFirst}
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <DrawerFooter className="drawer-safe gap-2 pt-2">
        <Button
          className="h-10 w-full"
          disabled={!savable}
          onClick={() => run(() => updateItem(item.id, changes), copy.saved)}
        >
          {copy.save}
        </Button>
        <Button
          variant="outline"
          className="h-10 w-full"
          disabled={busy}
          onClick={() =>
            item.status === 'received'
              ? run(() => reopenItem(item.id), copy.reopened)
              : run(() => receiveItem(item.id), copy.markedReceived)
          }
        >
          {item.status === 'received' ? null : <CheckIcon />}
          {item.status === 'received' ? copy.reopen : copy.received}
        </Button>
      </DrawerFooter>
    </>
  );
}
