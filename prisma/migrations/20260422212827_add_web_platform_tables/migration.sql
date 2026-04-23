-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PARENT', 'PROVIDER', 'BUSINESS', 'PRESS', 'OTHER');

-- CreateTable
CREATE TABLE "contact_submissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" "ContactType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_application_drafts" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "step" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_application_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_submissions_email_idx" ON "contact_submissions"("email");

-- CreateIndex
CREATE INDEX "contact_submissions_type_createdAt_idx" ON "contact_submissions"("type", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "web_application_drafts_userId_key" ON "web_application_drafts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "web_application_drafts_email_key" ON "web_application_drafts"("email");

-- CreateIndex
CREATE INDEX "web_application_drafts_userId_idx" ON "web_application_drafts"("userId");

-- CreateIndex
CREATE INDEX "web_application_drafts_email_idx" ON "web_application_drafts"("email");
