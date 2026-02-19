import Fastify from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

type EvidenceChunk = { id: string; meeting_id: string; start_ts: number; end_ts: number; text: string; hash: string };
type Note = { id: string; meeting_id: string; summary: string; bullets: string[]; md: string; created_at: string };
type Db = { notes: Note[]; evidence: EvidenceChunk[] };

const dbPath = resolve(process.cwd(), 'services/notes-knowledge/.data/notes.json');
const envSchema = z.object({ PORT: z.coerce.number().default(3000), SERVICE_NAME: z.string() });
const generateSchema = z.object({ meeting_id: z.string().min(1), transcript_text: z.string().min(10) });

const env = envSchema.parse({ PORT: process.env.PORT, SERVICE_NAME: process.env.SERVICE_NAME ?? 'notes-knowledge' });
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db { try { return JSON.parse(readFileSync(dbPath, 'utf8')) as Db; } catch { return { notes: [], evidence: [] }; } }
function saveDb(db: Db): void { mkdirSync(dirname(dbPath), { recursive: true }); writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

function splitSentences(text: string): string[] {
  return text.split(/[.!?]\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));
app.get('/v1/events/outbox', async () => ({ event: 'notes-knowledge.initialized', message: 'Outbox event contract placeholder for NATS publication.' }));

app.post('/notes/generate', async (req, reply) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const sentences = splitSentences(parsed.data.transcript_text);
  const bullets = sentences.slice(0, 5);
  const summary = bullets.slice(0, 2).join('. ');

  const evidence: EvidenceChunk[] = bullets.map((text, idx) => ({
    id: randomUUID(),
    meeting_id: parsed.data.meeting_id,
    start_ts: idx * 12,
    end_ts: idx * 12 + 10,
    text,
    hash: createHash('sha256').update(text).digest('hex')
  }));

  const note: Note = {
    id: randomUUID(),
    meeting_id: parsed.data.meeting_id,
    summary,
    bullets,
    md: `# Notes\n\n## Summary\n${summary}\n\n## Bullets\n${bullets.map((b) => `- ${b}`).join('\n')}`,
    created_at: new Date().toISOString()
  };

  const db = loadDb();
  db.notes.push(note);
  db.evidence.push(...evidence);
  saveDb(db);

  return { note, evidence_chunks: evidence };
});

app.get('/notes/:meeting_id', async (req, reply) => {
  const { meeting_id } = req.params as { meeting_id: string };
  const db = loadDb();
  const note = db.notes.find((n) => n.meeting_id === meeting_id);
  if (!note) return reply.code(404).send({ error: 'note_not_found' });
  return { note, evidence_chunks: db.evidence.filter((e) => e.meeting_id === meeting_id) };
});

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return;
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    reply.code(401);
    throw new Error('Missing bearer token');
  }
});

app.listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => app.log.info({ service: env.SERVICE_NAME }, 'service started'))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
