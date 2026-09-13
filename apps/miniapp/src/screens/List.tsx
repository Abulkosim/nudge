import type { ItemSummaryDto, UserDto } from '@nudge/shared';
import { useItems, type ListStatus } from '@/api/items';
import { TimezoneBanner } from '@/components/TimezoneBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { copy } from '@/copy';
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
  const line = item.status === 'open' ? item.remindAt : item.receivedAt;
  return (
    <Button
      variant="ghost"
      onClick={() => onOpen(item)}
      className="h-auto w-full flex-col items-stretch gap-1 rounded-xl px-3 py-3 text-left ring-1 ring-foreground/10"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 font-semibold whitespace-normal">
          {item.what}
        </span>
        {overdue ? <Badge variant="destructive">{copy.overdue}</Badge> : null}
      </span>
      <span className="text-xs font-normal text-muted-foreground">
        {item.fromWhom ? `${copy.from(item.fromWhom)}, ` : ''}
        {item.expectedOn ? formatDate(item.expectedOn) : copy.noDate}
      </span>
      {line ? (
        <span className="text-xs font-normal text-muted-foreground">
          {item.status === 'open'
            ? copy.reminds(formatInstant(line, zone))
            : copy.receivedOn(formatInstantDate(line, zone))}
        </span>
      ) : null}
    </Button>
  );
}

export function List({
  user,
  onUser,
  tab,
  onTab,
  onOpen,
}: {
  user: UserDto;
  onUser: (user: UserDto) => void;
  tab: ListStatus;
  onTab: (tab: ListStatus) => void;
  onOpen: (item: ItemSummaryDto) => void;
}) {
  const { items, error, loading, reload } = useItems(tab);
  const zone = user.timezone ?? deviceZone();
  const body = loading ? (
    <p role="status" className="text-sm text-muted-foreground">
      {copy.loading}
    </p>
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
    <p className="text-sm text-muted-foreground">
      {tab === 'open' ? copy.nothingWaiting : copy.nothingReceived}
    </p>
  ) : (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Row item={item} zone={zone} onOpen={onOpen} />
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
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map(({ value }) => (
          <TabsContent key={value} value={value}>
            {body}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
