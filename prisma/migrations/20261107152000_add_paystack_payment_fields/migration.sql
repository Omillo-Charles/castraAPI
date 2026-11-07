-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYSTACK_MPESA_STK';

-- AlterTable
ALTER TABLE "payments"
ADD COLUMN "paystackReference" TEXT,
ADD COLUMN "paystackTransactionId" INTEGER,
ADD COLUMN "paystackAccessCode" TEXT,
ADD COLUMN "paystackAuthorizationUrl" TEXT,
ADD COLUMN "paystackChannel" TEXT,
ADD COLUMN "paystackGatewayResponse" TEXT,
ADD COLUMN "paystackCurrency" TEXT,
ADD COLUMN "paystackPaidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "paystack_webhook_events" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "reference" TEXT,
    "transactionId" INTEGER,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paystack_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_paystackReference_key" ON "payments"("paystackReference");

-- CreateIndex
CREATE UNIQUE INDEX "paystack_webhook_events_eventKey_key" ON "paystack_webhook_events"("eventKey");

-- CreateIndex
CREATE INDEX "paystack_webhook_events_reference_idx" ON "paystack_webhook_events"("reference");

-- CreateIndex
CREATE INDEX "paystack_webhook_events_transactionId_idx" ON "paystack_webhook_events"("transactionId");
