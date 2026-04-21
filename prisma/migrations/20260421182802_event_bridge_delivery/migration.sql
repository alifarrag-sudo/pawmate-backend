-- CreateTable
CREATE TABLE "event_bridge_deliveries" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_bridge_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_bridge_deliveries_eventId_key" ON "event_bridge_deliveries"("eventId");

-- CreateIndex
CREATE INDEX "event_bridge_deliveries_delivered_createdAt_idx" ON "event_bridge_deliveries"("delivered", "createdAt");

-- CreateIndex
CREATE INDEX "event_bridge_deliveries_eventName_idx" ON "event_bridge_deliveries"("eventName");
