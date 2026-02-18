import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ResearchItem } from './providers.js';

export type ResearchSession = {
  id: string;
  workspace_id: string;
  user_id: string;
  topic: string;
  model_id: string;
  provider: string;
  created_at: string;
  updated_at: string;
  attached_items: ResearchItem[];
};

type SessionDb = { sessions: ResearchSession[] };

const dbPath = resolve(process.cwd(), 'services/research/.data/sessions.json');

function loadDb(): SessionDb {
  try {
    return JSON.parse(readFileSync(dbPath, 'utf8')) as SessionDb;
  } catch {
    return { sessions: [] };
  }
}

function saveDb(db: SessionDb): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

export function createSession(input: Omit<ResearchSession, 'created_at' | 'updated_at' | 'attached_items'>): ResearchSession {
  const db = loadDb();
  const now = new Date().toISOString();
  const session: ResearchSession = { ...input, created_at: now, updated_at: now, attached_items: [] };
  db.sessions.push(session);
  saveDb(db);
  return session;
}

export function getSession(id: string): ResearchSession | null {
  const db = loadDb();
  return db.sessions.find((s) => s.id === id) ?? null;
}

export function listSessions(workspaceId?: string): ResearchSession[] {
  const db = loadDb();
  return workspaceId ? db.sessions.filter((s) => s.workspace_id === workspaceId) : db.sessions;
}

export function attachItems(id: string, items: ResearchItem[]): ResearchSession | null {
  const db = loadDb();
  const target = db.sessions.find((s) => s.id === id);
  if (!target) return null;
  const existing = new Set(target.attached_items.map((i) => `${i.provider}:${i.provider_id}`));
  for (const item of items) {
    const key = `${item.provider}:${item.provider_id}`;
    if (!existing.has(key)) target.attached_items.push(item);
  }
  target.updated_at = new Date().toISOString();
  saveDb(db);
  return target;
}
