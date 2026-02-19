CREATE TABLE IF NOT EXISTS "Avatar" (
  "id" TEXT PRIMARY KEY,
  "avatarId" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "qualityScore" DOUBLE PRECISION,
  "similarityScore" DOUBLE PRECISION,
  "previewVideoRef" TEXT,
  "reasonCode" TEXT,
  "pipelineVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AvatarUpload" (
  "id" TEXT PRIMARY KEY,
  "avatarId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "ref" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "OutboxEvent" (
  "id" TEXT PRIMARY KEY,
  "aggregateId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "publishedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
