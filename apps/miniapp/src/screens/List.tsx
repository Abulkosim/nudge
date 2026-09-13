import { useState } from 'react';
import type { ItemSummaryDto, UserDto } from '@nudge/shared';
import { ChevronRightIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useItems, type ListStatus } from '@/api/items';
import { TimezoneBanner } from '@/components/TimezoneBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { copy } from '@/copy';
import { Detail } from '@/screens/Detail';
import {
  deviceZone,
  formatDate,
  formatInstant,
  formatInstantDate,
  today,
} from '@/lib/time';

const tabs: { value: ListStatus; label: string }[] = [
  { value: 'open', label: copy.waiting },
  { value: 'received', label: copy.received },
];
const dot = ' · ';

function Row({
  item,
  zone,
  onOpen,
}: {
  item: ItemSummaryDto;
  zone: string;
  onOpen: (item: ItemSummaryDto) => void;
}) {
  const overdue =
    item.status === 'open' &&
    item.expectedOn !== null &&
    item.expectedOn < today(zone);
  const when = item.status === 'open' ? item.remindAt : item.receivedAt;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-card px-3.5 py-3 text-left ring-1 ring-foreground/10 transition-colors active:bg-muted"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-medium">{item.what}</span>
          {overdue ? (
            <Badge variant="destructive" className="mt-0.5">
              {copy.overdue}
            </Badge>
          ) : null}
        </span>
        <span className="text-sm text-muted-foreground">
          {item.fromWhom ? copy.from(item.fromWhom) + dot : ''}
          {item.expectedOn ? formatDate(item.expectedOn) : copy.noDate}
        </span>
        {when ? (
          <span className="text-xs text-muted-foreground">
            {item.status === 'open'
              ? copy.reminds(formatInstant(when, zone))
              : copy.receivedOn(formatInstantDate(when, zone))}
          </span>
        ) : null}
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    </button>
  );
}

function Rows() {
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">{copy.loading}</span>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="flex min-h-14 flex-col justify-center gap-2 rounded-xl bg-card px-3.5 py-3 ring-1 ring-foreground/10"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function List({
  user,
  onUser,
  tab,
  onTab,
}: {
  user: UserDto;
  onUser: (user: UserDto) => void;
  tab: ListStatus;
  onTab: (tab: ListStatus) => void;
}) {
  const { items, error, loading, reload } = useItems(tab);
  const [open, setOpen] = useState<ItemSummaryDto | null>(null);
  const zone = user.timezone ?? deviceZone();
  const body = loading ? (
    <Rows />
  ) : error ? (
    <div className="flex flex-col items-start gap-2">
      <p role="alert" className="text-sm">
        {error}
      </p>
      <Button size="sm" variant="outline" onClick={reload}>
        {copy.retry}
      </Button>
    </div>
  ) : items.length === 0 ? (
    <p className="px-6 py-10 text-center text-sm text-muted-foreground">
      {tab === 'open' ? copy.nothingWaiting : copy.nothingReceived}
    </p>
  ) : (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Row item={item} zone={zone} onOpen={setOpen} />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="flex flex-col gap-4">
      <TimezoneBanner user={user} onUser={onUser} />
      <Tabs value={tab} onValueChange={(value) => onTab(value as ListStatus)}>
        <TabsList className="w-full">
          {tabs.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="flex-1">
              {label}
              {value === tab && !loading && !error ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {items.length}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map(({ value }) => (
          <TabsContent key={value} value={value}>
            {body}
          </TabsContent>
        ))}
      </Tabs>
      <Drawer
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <DrawerContent className="max-h-[85svh]">
          {open ? (
            <Detail
              key={open.id}
              item={open}
              user={user}
              onDone={(message) => {
                setOpen(null);
                reload();
                toast(message);
              }}
            />
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
