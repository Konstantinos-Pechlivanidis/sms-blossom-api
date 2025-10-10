-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unknown');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "ageYears" INTEGER,
ADD COLUMN     "birthdate" TIMESTAMP(3),
ADD COLUMN     "conversionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "conversionLtvCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gender" "Gender" NOT NULL DEFAULT 'unknown',
ADD COLUMN     "lastConvertedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE INDEX "Contact_shopId_gender_idx" ON "Contact"("shopId", "gender");

-- CreateIndex
CREATE INDEX "Contact_shopId_ageYears_idx" ON "Contact"("shopId", "ageYears");

-- CreateIndex
CREATE INDEX "Contact_shopId_lastConvertedAt_idx" ON "Contact"("shopId", "lastConvertedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_slug_key" ON "Segment"("slug");
