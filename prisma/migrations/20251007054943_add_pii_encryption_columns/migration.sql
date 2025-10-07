-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "email_ciphertext" TEXT,
ADD COLUMN     "email_hash" TEXT,
ADD COLUMN     "phone_ciphertext" TEXT,
ADD COLUMN     "phone_hash" TEXT,
ADD COLUMN     "phone_last4" TEXT;

-- AlterTable
ALTER TABLE "Discount" ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "Contact_shopId_phone_hash_idx" ON "Contact"("shopId", "phone_hash");

-- CreateIndex
CREATE INDEX "Contact_shopId_email_hash_idx" ON "Contact"("shopId", "email_hash");
