CREATE TABLE IF NOT EXISTS "RagDocument" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "RagChunk" (
  "id" TEXT PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "section" TEXT,
  "content" TEXT NOT NULL,
  "citationRef" TEXT NOT NULL,
  "pageRef" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
