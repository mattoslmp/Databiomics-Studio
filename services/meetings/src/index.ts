import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

type Meeting = {
  meeting_id: string;
  workspace_id: string;
  host_user_id: string;
  status: 'scheduled' | 'live' | 'ended';
  transcription_enabled: boolean;
  disclosure_badge: string;
  policy_id?: string;
  created_at: string;
  avatar_bot_approved: boolean;
};

type Db = { meetings: Meeting[] };
const dbPath = resolve(process.cwd(), 'services/meetings/.data/meetings.json');

const envSchema = z.object({ PORT: z.coerce.number().default(3000), SERVICE_NAME: z.string() });
const createSchema = z.object({ workspace_id: z.string(), host_user_id: z.string(), policy_id: z.string().optional() });
const toggleSchema = z.object({ enabled: z.boolean() });
const approvalSchema = z.object({ approved: z.boolean() });

const env = envSchema.parse({ PORT: process.env.PORT, SERVICE_NAME: process.env.SERVICE_NAME ?? 'meetings' });
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db { try { return JSON.parse(readFileSync(dbPath, 'utf8')) as Db; } catch { return { meetings: [] }; } }
function saveDb(db: Db): void { mkdirSync(dirname(dbPath), { recursive: true }); writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));
app.get('/v1/events/outbox', async () => ({ event: 'meetings.initialized', message: 'Outbox event contract placeholder for NATS publication.' }));

app.post('/meetings', async (req, reply) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const meeting: Meeting = {
    meeting_id: randomUUID(),
    status: 'scheduled',
    transcription_enabled: false,
    disclosure_badge: 'AVATAR VIRTUAL — Databiomics Studio',
    avatar_bot_approved: false,
    created_at: new Date().toISOString(),
    ...parsed.data
  };
  const db = loadDb();
  db.meetings.push(meeting);
  saveDb(db);
  return { meeting };
});

app.post('/meetings/:meeting_id/transcription', async (req, reply) => {
  const { meeting_id } = req.params as { meeting_id: string };
  const parsed = toggleSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const db = loadDb();
  const meeting = db.meetings.find((m) => m.meeting_id === meeting_id);
  if (!meeting) return reply.code(404).send({ error: 'meeting_not_found' });
  meeting.transcription_enabled = parsed.data.enabled;
  saveDb(db);
  return { meeting, banner: parsed.data.enabled ? 'TRANSCRIÇÃO ATIVA' : 'TRANSCRIÇÃO INATIVA' };
});

app.post('/meetings/:meeting_id/avatar-bot-approval', async (req, reply) => {
  const { meeting_id } = req.params as { meeting_id: string };
  const parsed = approvalSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const db = loadDb();
  const meeting = db.meetings.find((m) => m.meeting_id === meeting_id);
  if (!meeting) return reply.code(404).send({ error: 'meeting_not_found' });
  meeting.avatar_bot_approved = parsed.data.approved;
  saveDb(db);
  return {
    meeting,
    disclosure_audio: 'Olá, eu sou um avatar virtual do Databiomics Studio.'
  };
});

app.get('/meetings/:meeting_id', async (req, reply) => {
  const { meeting_id } = req.params as { meeting_id: string };
  const meeting = loadDb().meetings.find((m) => m.meeting_id === meeting_id);
  if (!meeting) return reply.code(404).send({ error: 'meeting_not_found' });
  return { meeting };
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
