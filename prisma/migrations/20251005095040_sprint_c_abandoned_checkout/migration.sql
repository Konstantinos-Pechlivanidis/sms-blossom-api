/*
  Warnings:

  - You are about to drop the column `key` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `kind` on the `Job` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[dedupeKey]` on the table `Job` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_shopId_fkey";

-- DropIndex
DROP INDEX "Job_key_key";

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "key",
DROP COLUMN "kind",
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'abandoned_checkout',
ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
