-- Approval proposals submitted by AI agents, resolved by an owner.
-- See backend/src/modules/admin/approvals.* for the consumer.

CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

CREATE TABLE "approvals" (
  "id"          TEXT NOT NULL,
  "agentId"     TEXT NOT NULL,
  "actionType"  TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "reasoning"   TEXT,
  "status"      "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "routing"     TEXT NOT NULL DEFAULT 'ali_or_john',
  "resolvedBy"  TEXT,
  "resolution"  TEXT,
  "comment"     TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"  TIMESTAMP(3),

  CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approvals_status_createdAt_idx" ON "approvals"("status", "createdAt" DESC);
CREATE INDEX "approvals_agentId_createdAt_idx" ON "approvals"("agentId", "createdAt" DESC);
CREATE INDEX "approvals_routing_status_idx" ON "approvals"("routing", "status");
