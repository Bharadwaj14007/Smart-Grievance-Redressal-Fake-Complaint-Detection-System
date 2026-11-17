CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');

CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
  'NOT_CONFIGURED',
  'QUEUED',
  'PROCESSING',
  'DELIVERED',
  'FAILED'
);

CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL,
  "notification_id" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider_message_id" TEXT,
  "error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_deliveries_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "notifications"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key"
ON "notification_deliveries"("notification_id", "channel");

CREATE INDEX "notification_deliveries_status_next_attempt_at_idx"
ON "notification_deliveries"("status", "next_attempt_at");
