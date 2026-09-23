-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "questionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timeLimitSec" INTEGER;
