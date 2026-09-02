-- Support the unread-count lookup and the per-user notification timeline.
-- Existing single-column indexes are retained to avoid changing other query plans.
CREATE INDEX "notifications_userId_read_idx"
  ON "notifications"("userId", "read");

CREATE INDEX "notifications_userId_createdAt_idx"
  ON "notifications"("userId", "createdAt" DESC);
