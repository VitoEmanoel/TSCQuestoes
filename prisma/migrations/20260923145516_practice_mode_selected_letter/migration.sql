/*
  Warnings:

  - You are about to drop the column `selectedOptionId` on the `AttemptItem` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "AttemptMode" ADD VALUE 'PRACTICE';

-- AlterTable
ALTER TABLE "AttemptItem" DROP COLUMN "selectedOptionId",
ADD COLUMN     "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "selectedLetter" TEXT;

-- CreateIndex
CREATE INDEX "AttemptItem_attemptId_questionId_idx" ON "AttemptItem"("attemptId", "questionId");
