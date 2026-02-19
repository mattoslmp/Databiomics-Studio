import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type UploadSession = {
  id: string;
  workspace_id: string;
  user_id: string;
  upload_type: 'avatar' | 'audio' | 'video' | 'deck_asset';
  protocol: 'tus' | 'multipart';
  status: 'created' | 'in_progress' | 'completed' | 'failed';
  expected_size: number;
  received_size: number;
  sha256?: string;
  metadata: Record<string, string>;
  chunks_b64: string[];
  created_at: string;
  finished_at?: string;
};

type Db = { sessions: UploadSession[] };

const dbPath = resolve(process.cwd(), 'services/upload/.data/upload-sessions.json');

function loadDb(): Db {
  try {
    return JSON.parse(readFileSync(dbPath, 'utf8')) as Db;
  } catch {
    return { sessions: [] };
  }
}

function saveDb(db: Db): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

export function createUploadSession(input: {
  workspace_id: string;
  user_id: string;
  upload_type: UploadSession['upload_type'];
  expected_size: number;
  metadata?: Record<string, string>;
}): UploadSession {
  const session: UploadSession = {
    id: randomUUID(),
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    upload_type: input.upload_type,
    protocol: 'tus',
    status: 'created',
    expected_size: input.expected_size,
    received_size: 0,
    metadata: input.metadata ?? {},
    chunks_b64: [],
    created_at: new Date().toISOString()
  };
  const db = loadDb();
  db.sessions.push(session);
  saveDb(db);
  return session;
}

export function getUploadSession(id: string): UploadSession | null {
  const db = loadDb();
  return db.sessions.find((s) => s.id === id) ?? null;
}

export function appendUploadChunk(id: string, offset: number, chunk: Buffer): UploadSession | null {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === id);
  if (!session) return null;
  if (session.received_size !== offset) {
    throw new Error(`invalid_offset:${session.received_size}`);
  }

  session.chunks_b64.push(chunk.toString('base64'));
  session.received_size += chunk.length;
  session.status = session.received_size >= session.expected_size ? 'completed' : 'in_progress';
  if (session.status === 'completed') {
    session.finished_at = new Date().toISOString();
  }

  saveDb(db);
  return session;
}

export function finalizeUpload(id: string, expectedSha256?: string): UploadSession | null {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === id);
  if (!session) return null;
  const raw = Buffer.concat(session.chunks_b64.map((c) => Buffer.from(c, 'base64')));
  const digest = createHash('sha256').update(raw).digest('hex');
  session.sha256 = digest;
  if (expectedSha256 && expectedSha256 !== digest) {
    session.status = 'failed';
  } else if (session.received_size === session.expected_size) {
    session.status = 'completed';
  }
  session.finished_at = new Date().toISOString();
  saveDb(db);
  return session;
}
