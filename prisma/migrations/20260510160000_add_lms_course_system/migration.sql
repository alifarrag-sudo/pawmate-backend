-- G1 LMS — in-house provider training. 3 enums + 5 tables.
-- All FKs cascade-on-delete from the appropriate parent so a deleted
-- provider takes their enrollments + lesson progress with them.

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE "CourseId" AS ENUM (
  'WALKER_SAFETY_MODULE',
  'DAY_CARE_PROVIDER_COURSE',
  'BOARDING_PROVIDER_COURSE'
);

CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'TEXT', 'QUIZ');

CREATE TYPE "CourseStatus" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'PASSED',
  'FAILED'
);

-- ─── Course ──────────────────────────────────────────────────────────────────
CREATE TABLE "Course" (
  "id"               "CourseId" NOT NULL,
  "titleEn"          TEXT NOT NULL,
  "titleAr"          TEXT NOT NULL,
  "descriptionEn"    TEXT NOT NULL,
  "descriptionAr"    TEXT NOT NULL,
  "totalLessons"     INTEGER NOT NULL,
  "estimatedMinutes" INTEGER NOT NULL,
  "passScore"        INTEGER NOT NULL DEFAULT 80,
  "maxAttempts"      INTEGER NOT NULL DEFAULT 3,
  "cooldownHours"    INTEGER NOT NULL DEFAULT 24,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- ─── CourseLesson ────────────────────────────────────────────────────────────
CREATE TABLE "CourseLesson" (
  "id"              TEXT NOT NULL,
  "courseId"        "CourseId" NOT NULL,
  "order"           INTEGER NOT NULL,
  "titleEn"         TEXT NOT NULL,
  "titleAr"         TEXT NOT NULL,
  "type"            "LessonType" NOT NULL,
  "youtubeUrl"      TEXT,
  "durationMinutes" INTEGER,
  "contentEn"       TEXT,
  "contentAr"       TEXT,
  CONSTRAINT "CourseLesson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseLesson_courseId_order_key"
  ON "CourseLesson"("courseId", "order");
CREATE INDEX "CourseLesson_courseId_idx"
  ON "CourseLesson"("courseId");

ALTER TABLE "CourseLesson"
  ADD CONSTRAINT "CourseLesson_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── QuizQuestion ────────────────────────────────────────────────────────────
CREATE TABLE "QuizQuestion" (
  "id"            TEXT NOT NULL,
  "lessonId"      TEXT NOT NULL,
  "order"         INTEGER NOT NULL,
  "questionEn"    TEXT NOT NULL,
  "questionAr"    TEXT NOT NULL,
  "options"       JSONB NOT NULL,
  "correctId"     TEXT NOT NULL,
  "explanationEn" TEXT,
  "explanationAr" TEXT,
  CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuizQuestion_lessonId_idx" ON "QuizQuestion"("lessonId");

ALTER TABLE "QuizQuestion"
  ADD CONSTRAINT "QuizQuestion_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "CourseLesson"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── CourseEnrollment ────────────────────────────────────────────────────────
CREATE TABLE "CourseEnrollment" (
  "id"                  TEXT NOT NULL,
  "providerId"          TEXT NOT NULL,
  "courseId"            "CourseId" NOT NULL,
  "status"              "CourseStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "startedAt"           TIMESTAMP(3),
  "completedAt"         TIMESTAMP(3),
  "currentLesson"       INTEGER NOT NULL DEFAULT 1,
  "score"               INTEGER,
  "attempts"            INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt"       TIMESTAMP(3),
  "certificateKey"      TEXT,
  "certificateIssuedAt" TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseEnrollment_providerId_courseId_key"
  ON "CourseEnrollment"("providerId", "courseId");
CREATE INDEX "CourseEnrollment_providerId_idx" ON "CourseEnrollment"("providerId");
CREATE INDEX "CourseEnrollment_status_idx"     ON "CourseEnrollment"("status");

ALTER TABLE "CourseEnrollment"
  ADD CONSTRAINT "CourseEnrollment_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseEnrollment"
  ADD CONSTRAINT "CourseEnrollment_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── LessonProgress ──────────────────────────────────────────────────────────
CREATE TABLE "LessonProgress" (
  "id"           TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "lessonOrder"  INTEGER NOT NULL,
  "completedAt"  TIMESTAMP(3),
  "quizScore"    INTEGER,
  CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LessonProgress_enrollmentId_lessonOrder_key"
  ON "LessonProgress"("enrollmentId", "lessonOrder");

ALTER TABLE "LessonProgress"
  ADD CONSTRAINT "LessonProgress_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
