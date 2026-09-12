-- The draft step column now names any question the bot is waiting on, so the enum and the
-- column are renamed in place and existing rows keep their values.
ALTER TYPE "DraftStep" RENAME TO "Awaiting";
ALTER TYPE "Awaiting" ADD VALUE 'snooze_on';
ALTER TABLE "Item" RENAME COLUMN "draftStep" TO "awaiting";

ALTER TYPE "ReminderStatus" ADD VALUE 'failed';

CREATE TYPE "ReminderKind" AS ENUM ('scheduled', 'repeat', 'snooze');
ALTER TABLE "Reminder" ADD COLUMN "kind" "ReminderKind" NOT NULL DEFAULT 'scheduled';
