-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "welcomedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BackInStockInterest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "variantId" TEXT,
    "productHandle" TEXT,
    "lastNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "BackInStockInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackInStockInterest_shopId_inventoryItemId_idx" ON "BackInStockInterest"("shopId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BackInStockInterest_shopId_contactId_inventoryItemId_key" ON "BackInStockInterest"("shopId", "contactId", "inventoryItemId");

-- AddForeignKey
ALTER TABLE "BackInStockInterest" ADD CONSTRAINT "BackInStockInterest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackInStockInterest" ADD CONSTRAINT "BackInStockInterest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
