-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'automation',
ADD COLUMN     "triggerKey" TEXT;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "locale" TEXT;

-- CreateIndex
CREATE INDEX "Message_shopId_contactId_triggerKey_idx" ON "Message"("shopId", "contactId", "triggerKey");
