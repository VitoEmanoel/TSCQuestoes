-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Question_publishedAt_idx" ON "Question"("publishedAt");

UPDATE "Question" SET "publishedAt" = NOW() WHERE "publishedAt" IS NULL;
