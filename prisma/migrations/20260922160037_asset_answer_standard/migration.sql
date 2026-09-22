-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "answerStandardId" TEXT;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_answerStandardId_fkey" FOREIGN KEY ("answerStandardId") REFERENCES "AnswerStandard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
