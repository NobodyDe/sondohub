-- CreateEnum
CREATE TYPE "AppEventType" AS ENUM ('OPEN', 'CLICK');

-- CreateTable
CREATE TABLE "app_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "type" "AppEventType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_events_application_id_created_at_idx" ON "app_events"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "app_events_user_id_created_at_idx" ON "app_events"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
