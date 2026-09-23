-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "reviewedAt" TIMESTAMP(3);

UPDATE "Question" SET "reviewedAt" = NOW() WHERE "reviewedAt" IS NULL;
