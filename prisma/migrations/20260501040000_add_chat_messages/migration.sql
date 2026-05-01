-- Persisted per-booking chat messages.
-- Written by the Socket.IO chat:send handler in events.gateway.ts and read
-- back by GET /chat/messages/:bookingId.

CREATE TABLE "chat_messages" (
  "id"         TEXT NOT NULL,
  "bookingId"  TEXT NOT NULL,
  "senderId"   TEXT NOT NULL,
  "senderRole" TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "readAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_messages_bookingId_createdAt_idx" ON "chat_messages"("bookingId", "createdAt");
CREATE INDEX "chat_messages_bookingId_readAt_idx" ON "chat_messages"("bookingId", "readAt");

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_bookingId_fkey" FOREIGN KEY ("bookingId")
    REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_senderId_fkey" FOREIGN KEY ("senderId")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
