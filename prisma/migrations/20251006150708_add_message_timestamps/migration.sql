-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "failed_at" TIMESTAMP(3),
ADD COLUMN     "sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Message_shopId_status_sent_at_idx" ON "Message"("shopId", "status", "sent_at");

-- CreateIndex
CREATE INDEX "Message_shopId_sent_at_idx" ON "Message"("shopId", "sent_at");
