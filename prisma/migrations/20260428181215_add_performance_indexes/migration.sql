-- Performance indexes for dashboard and browse queries (Prompt 23)

-- Booking: dashboard queries filter by status + date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Booking_status_createdAt_idx" ON "Booking" ("status", "createdAt");

-- Booking: parent booking history queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Booking_parentId_createdAt_idx" ON "Booking" ("parentId", "createdAt");

-- PetFriendProfile: browse by city + status
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PetFriendProfile_status_addressCity_idx" ON "PetFriendProfile" ("status", "addressCity");
