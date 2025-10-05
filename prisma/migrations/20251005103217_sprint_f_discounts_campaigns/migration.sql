/*
  Warnings:

  - You are about to drop the column `title` on the `Discount` table. All the data in the column will be lost.
  - Added the required column `type` to the `Discount` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Discount" DROP CONSTRAINT "Discount_shopId_fkey";

-- DropIndex
DROP INDEX "Discount_shopId_code_key";

-- DropIndex
DROP INDEX "Discount_shopId_createdAt_idx";

-- AlterTable
ALTER TABLE "Discount" DROP COLUMN "title",
ADD COLUMN     "applyUrl" TEXT,
ADD COLUMN     "currencyCode" TEXT,
ADD COLUMN     "oncePerCustomer" BOOLEAN DEFAULT true,
ADD COLUMN     "providerId" TEXT,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "usageLimit" INTEGER,
ADD COLUMN     "utmJson" JSONB,
ADD COLUMN     "value" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "Shortlink" (
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT,
    "url" TEXT NOT NULL,
    "campaignId" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Shortlink_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segmentId" TEXT,
    "templateId" TEXT,
    "templateKey" TEXT,
    "scheduleAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "utmJson" JSONB,
    "batchSize" INTEGER,
    "bodyText" TEXT,
    "discountId" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_shopId_status_scheduleAt_idx" ON "Campaign"("shopId", "status", "scheduleAt");

-- CreateIndex
CREATE INDEX "Discount_shopId_code_idx" ON "Discount"("shopId", "code");

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shortlink" ADD CONSTRAINT "Shortlink_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
