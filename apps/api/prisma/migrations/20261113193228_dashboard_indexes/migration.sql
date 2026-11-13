-- CreateIndex
CREATE INDEX "sessions_created_at_idx" ON "sessions"("created_at");

-- CreateIndex
CREATE INDEX "user_app_access_granted_at_idx" ON "user_app_access"("granted_at");
