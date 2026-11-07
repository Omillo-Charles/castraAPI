-- Existing Daraja payments remain recorded as manual M-Pesa payments after
-- Daraja support is removed from the application.
UPDATE "payments"
SET "method" = 'MPESA_MANUAL'
WHERE "method" = 'MPESA_STK';

-- Remove Daraja-specific payment data.
ALTER TABLE "payments"
DROP COLUMN "stkPhone",
DROP COLUMN "checkoutRequestId";

-- Rebuild the enum without the removed Daraja value.
CREATE TYPE "PaymentMethod_new" AS ENUM ('MPESA_MANUAL', 'PAYSTACK_MPESA_STK');

ALTER TABLE "payments"
ALTER COLUMN "method" TYPE "PaymentMethod_new"
USING ("method"::text::"PaymentMethod_new");

DROP TYPE "PaymentMethod";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
