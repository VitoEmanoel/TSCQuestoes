-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Asset_questionId_answerStandardId_position_idx" ON "Asset"("questionId", "answerStandardId", "position");

UPDATE "Asset" AS a
SET "position" = ranked.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "questionId", "answerStandardId" ORDER BY "filePath"
  ) - 1 AS rn
  FROM "Asset"
) AS ranked
WHERE a.id = ranked.id;
