-- AlterTable
ALTER TABLE "CreativeSession" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "GymSession" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "MBAActivity" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "ProfessionalAchievement" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "SideProjectLog" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "catTargetDate" TEXT NOT NULL DEFAULT '2028-11-26';
