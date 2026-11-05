-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('GEMINI', 'GROQ', 'OLLAMA');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AiToolRisk" AS ENUM ('READ', 'WRITE', 'DESTRUCTIVE');

-- CreateEnum
CREATE TYPE "AiActionStatus" AS ENUM ('PENDING', 'RUNNING', 'EXECUTED', 'REJECTED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AiConfirmationPolicy" AS ENUM ('DESTRUCTIVE_ONLY', 'ALL_WRITES');

-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "apiKeyEncrypted" TEXT,
    "apiKeyHint" TEXT,
    "model" TEXT,
    "baseUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "userId" UUID NOT NULL,
    "preferredProvider" "AiProvider",
    "fallbackProvider" "AiProvider",
    "allowCloudFallback" BOOLEAN NOT NULL DEFAULT false,
    "confirmationPolicy" "AiConfirmationPolicy" NOT NULL DEFAULT 'DESTRUCTIVE_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "toolCalls" JSONB,
    "providerState" JSONB,
    "toolCallId" TEXT,
    "toolName" TEXT,
    "provider" "AiProvider",
    "model" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tool_actions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "conversationId" UUID,
    "toolCallId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "risk" "AiToolRisk" NOT NULL,
    "status" "AiActionStatus" NOT NULL,
    "args" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "result" JSONB,
    "provider" "AiProvider",
    "model" TEXT,
    "targetId" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ai_tool_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_configs_userId_provider_key" ON "ai_provider_configs"("userId", "provider");

-- CreateIndex
CREATE INDEX "ai_conversations_workspaceId_userId_updatedAt_idx" ON "ai_conversations"("workspaceId", "userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_messages_conversationId_seq_key" ON "ai_messages"("conversationId", "seq");

-- CreateIndex
CREATE INDEX "ai_tool_actions_conversationId_idx" ON "ai_tool_actions"("conversationId");

-- CreateIndex
CREATE INDEX "ai_tool_actions_workspaceId_userId_createdAt_idx" ON "ai_tool_actions"("workspaceId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_actions" ADD CONSTRAINT "ai_tool_actions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_actions" ADD CONSTRAINT "ai_tool_actions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
