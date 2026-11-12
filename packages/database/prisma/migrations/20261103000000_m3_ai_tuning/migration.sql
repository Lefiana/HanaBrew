-- CreateEnum
CREATE TYPE "AiResponseStyle" AS ENUM ('QUICK', 'CHATTY');

-- AlterTable
ALTER TABLE "ai_provider_configs" ADD COLUMN "fallbackModel" TEXT;

-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN "responseStyle" "AiResponseStyle" NOT NULL DEFAULT 'QUICK';
