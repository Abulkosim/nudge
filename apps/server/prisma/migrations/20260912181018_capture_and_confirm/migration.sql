CREATE TYPE "DraftStep" AS ENUM ('from_whom', 'expected_on', 'confirm', 'edit_what', 'edit_from_whom', 'edit_expected_on');

ALTER TABLE "Item" RENAME COLUMN "expectedAt" TO "expectedOn";
ALTER TABLE "Item" ALTER COLUMN "expectedOn" TYPE DATE USING ("expectedOn" AT TIME ZONE 'UTC')::date,
ADD COLUMN "draftStep" "DraftStep";

UPDATE "Item" SET "draftStep" = 'from_whom' WHERE "status" = 'draft';
CREATE UNIQUE INDEX "Item_one_draft_per_user" ON "Item" ("userId") WHERE "status" = 'draft';
