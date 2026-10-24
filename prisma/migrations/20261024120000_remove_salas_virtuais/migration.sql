-- AlterEnum
BEGIN;
CREATE TYPE "AttemptMode_new" AS ENUM ('PRACTICE', 'FULL_EXAM', 'CUSTOM');
ALTER TABLE "Attempt" ALTER COLUMN "mode" TYPE "AttemptMode_new" USING ("mode"::text::"AttemptMode_new");
ALTER TYPE "AttemptMode" RENAME TO "AttemptMode_old";
ALTER TYPE "AttemptMode_new" RENAME TO "AttemptMode";
DROP TYPE "public"."AttemptMode_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "AttemptStatus_new" AS ENUM ('IN_PROGRESS', 'SUBMITTED');
ALTER TABLE "public"."Attempt" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Attempt" ALTER COLUMN "status" TYPE "AttemptStatus_new" USING ("status"::text::"AttemptStatus_new");
ALTER TYPE "AttemptStatus" RENAME TO "AttemptStatus_old";
ALTER TYPE "AttemptStatus_new" RENAME TO "AttemptStatus";
DROP TYPE "public"."AttemptStatus_old";
ALTER TABLE "Attempt" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';
COMMIT;

-- DropForeignKey
ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_gradedById_fkey";

-- DropForeignKey
ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_roomId_fkey";

-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_teacherId_fkey";

-- DropForeignKey
ALTER TABLE "RoomQuestion" DROP CONSTRAINT "RoomQuestion_questionId_fkey";

-- DropForeignKey
ALTER TABLE "RoomQuestion" DROP CONSTRAINT "RoomQuestion_roomId_fkey";

-- AlterTable
ALTER TABLE "Attempt" DROP COLUMN "finalScore",
DROP COLUMN "gradedAt",
DROP COLUMN "gradedById",
DROP COLUMN "roomId";

-- AlterTable
ALTER TABLE "AttemptItem" DROP COLUMN "teacherComment",
DROP COLUMN "teacherScore",
DROP COLUMN "timeSpentSec";

-- DropTable
DROP TABLE "Room";

-- DropTable
DROP TABLE "RoomQuestion";

-- DropEnum
DROP TYPE "RoomStatus";

