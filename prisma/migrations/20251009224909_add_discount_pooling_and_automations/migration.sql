-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "discountConfig" JSONB;

-- AlterTable
ALTER TABLE "Discount" ADD COLUMN     "combinesWith" JSONB,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'shared',
ADD COLUMN     "poolId" TEXT,
ADD COLUMN     "shopifyGid" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "checkoutToken" TEXT,
ADD COLUMN     "hmacHeader" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "orderId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "discountCodeId" TEXT,
ADD COLUMN     "shortlinkId" TEXT,
ADD COLUMN     "utmJson" JSONB;

-- CreateTable
CREATE TABLE "DiscountCodePool" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "totalCodes" INTEGER NOT NULL DEFAULT 0,
    "reservedCodes" INTEGER NOT NULL DEFAULT 0,
    "usedCodes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "DiscountCodePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "reservedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "assignedTo" TEXT,
    "shopifyGid" TEXT,
    "reservationId" TEXT,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCodeReservation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "DiscountCodeReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "template" TEXT NOT NULL,
    "conditions" JSONB,
    "discountConfig" JSONB,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbandonedCheckout" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "checkoutToken" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "totalPrice" DECIMAL(10,2),
    "currency" TEXT,
    "abandonedAt" TIMESTAMP(3) NOT NULL,
    "recoveredAt" TIMESTAMP(3),
    "abandonedCheckoutUrl" TEXT,

    CONSTRAINT "AbandonedCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCodePool_discountId_key" ON "DiscountCodePool"("discountId");

-- CreateIndex
CREATE INDEX "DiscountCodePool_shopId_status_idx" ON "DiscountCodePool"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCodePool_shopId_discountId_key" ON "DiscountCodePool"("shopId", "discountId");

-- CreateIndex
CREATE INDEX "DiscountCode_shopId_status_idx" ON "DiscountCode"("shopId", "status");

-- CreateIndex
CREATE INDEX "DiscountCode_shopId_assignedTo_idx" ON "DiscountCode"("shopId", "assignedTo");

-- CreateIndex
CREATE INDEX "DiscountCode_shopId_poolId_status_idx" ON "DiscountCode"("shopId", "poolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_poolId_code_key" ON "DiscountCode"("poolId", "code");

-- CreateIndex
CREATE INDEX "DiscountCodeReservation_shopId_campaignId_idx" ON "DiscountCodeReservation"("shopId", "campaignId");

-- CreateIndex
CREATE INDEX "DiscountCodeReservation_shopId_poolId_idx" ON "DiscountCodeReservation"("shopId", "poolId");

-- CreateIndex
CREATE INDEX "DiscountCodeReservation_shopId_status_expiresAt_idx" ON "DiscountCodeReservation"("shopId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Automation_shopId_trigger_enabled_idx" ON "Automation"("shopId", "trigger", "enabled");

-- CreateIndex
CREATE INDEX "Automation_shopId_enabled_idx" ON "Automation"("shopId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AbandonedCheckout_checkoutToken_key" ON "AbandonedCheckout"("checkoutToken");

-- CreateIndex
CREATE INDEX "AbandonedCheckout_shopId_checkoutToken_idx" ON "AbandonedCheckout"("shopId", "checkoutToken");

-- CreateIndex
CREATE INDEX "AbandonedCheckout_shopId_customerId_idx" ON "AbandonedCheckout"("shopId", "customerId");

-- CreateIndex
CREATE INDEX "AbandonedCheckout_shopId_abandonedAt_idx" ON "AbandonedCheckout"("shopId", "abandonedAt");

-- CreateIndex
CREATE INDEX "Discount_shopId_mode_idx" ON "Discount"("shopId", "mode");

-- CreateIndex
CREATE INDEX "Discount_shopId_poolId_idx" ON "Discount"("shopId", "poolId");

-- CreateIndex
CREATE INDEX "Event_shopId_topic_idx" ON "Event"("shopId", "topic");

-- CreateIndex
CREATE INDEX "Event_shopId_idempotencyKey_idx" ON "Event"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Event_shopId_checkoutToken_idx" ON "Event"("shopId", "checkoutToken");

-- CreateIndex
CREATE INDEX "Event_shopId_orderId_idx" ON "Event"("shopId", "orderId");

-- CreateIndex
CREATE INDEX "Message_shopId_discountCodeId_idx" ON "Message"("shopId", "discountCodeId");

-- CreateIndex
CREATE INDEX "Message_shopId_shortlinkId_idx" ON "Message"("shopId", "shortlinkId");

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCodePool" ADD CONSTRAINT "DiscountCodePool_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCodePool" ADD CONSTRAINT "DiscountCodePool_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "DiscountCodePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "DiscountCodeReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCodeReservation" ADD CONSTRAINT "DiscountCodeReservation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCodeReservation" ADD CONSTRAINT "DiscountCodeReservation_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "DiscountCodePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCodeReservation" ADD CONSTRAINT "DiscountCodeReservation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbandonedCheckout" ADD CONSTRAINT "AbandonedCheckout_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
