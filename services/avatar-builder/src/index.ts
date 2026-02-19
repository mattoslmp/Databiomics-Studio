import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

type Avatar = {
  avatar_id: string;
  user_id: string;
  workspace_id: string;
  status: 'UPLOADED' | 'QC_OK' | 'LIVENESS_OK' | 'BUILDING' | 'READY' | 'FAILED';
  verified: boolean;
  quality_score?: number;
  pipeline_version: string;
  uploads: { type: 'facescan' | 'talk' | 'photos' | 'body'; ref: string; hash: string }[];
  created_at: string;
};

type Db = { avatars: Avatar[] };
const dbPath = resolve(process.cwd(), 'services/avatar-builder/.data/avatars.json');

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  SERVICE_NAME: z.string(),
  MOCK_MEDIA_PIPELINE: z.string().default('true')
});
const createSchema = z.object({ user_id: z.string(), workspace_id: z.string(), pipeline_version: z.string().default('v1') });
const uploadSchema = z.object({ type: z.enum(['facescan', 'talk', 'photos', 'body']), ref: z.string().min(3), hash: z.string().min(8) });
const livenessSchema = z.object({ challenge_text: z.string().min(3), response_text: z.string().min(3) });

const env = envSchema.parse({
  PORT: process.env.PORT,
  SERVICE_NAME: process.env.SERVICE_NAME ?? 'avatar-builder',
  MOCK_MEDIA_PIPELINE: process.env.MOCK_MEDIA_PIPELINE ?? 'true'
});
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db { try { return JSON.parse(readFileSync(dbPath, 'utf8')) as Db; } catch { return { avatars: [] }; } }
function saveDb(db: Db): void { mkdirSync(dirname(dbPath), { recursive: true }); writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME, mock_media_pipeline: env.MOCK_MEDIA_PIPELINE === 'true' }));
app.get('/v1/events/outbox', async () => ({ event: 'avatar-builder.initialized', message: 'Outbox event contract placeholder for NATS publication.' }));

app.post('/avatars', async (req, reply) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const avatar: Avatar = {
    avatar_id: randomUUID(),
    user_id: parsed.data.user_id,
    workspace_id: parsed.data.workspace_id,
    status: 'UPLOADED',
    verified: false,
    pipeline_version: parsed.data.pipeline_version,
    uploads: [],
    created_at: new Date().toISOString()
  };
  const db = loadDb();
  db.avatars.push(avatar);
  saveDb(db);
  return { avatar };
});

app.post('/avatars/:avatar_id/uploads', async (req, reply) => {
  const { avatar_id } = req.params as { avatar_id: string };
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const db = loadDb();
  const avatar = db.avatars.find((a) => a.avatar_id === avatar_id);
  if (!avatar) return reply.code(404).send({ error: 'avatar_not_found' });
  avatar.uploads.push(parsed.data);
  saveDb(db);
  return { avatar };
});

app.post('/avatars/:avatar_id/qc', async (req, reply) => {
  const { avatar_id } = req.params as { avatar_id: string };
  const db = loadDb();
  const avatar = db.avatars.find((a) => a.avatar_id === avatar_id);
  if (!avatar) return reply.code(404).send({ error: 'avatar_not_found' });
  const hasFace = avatar.uploads.some((u) => u.type === 'facescan' || u.type === 'photos');
  const hasTalk = avatar.uploads.some((u) => u.type === 'talk');
  avatar.quality_score = hasFace && hasTalk ? 0.92 : 0.31;
  avatar.status = avatar.quality_score > 0.7 ? 'QC_OK' : 'FAILED';
  saveDb(db);
  return { avatar };
});

app.post('/avatars/:avatar_id/liveness', async (req, reply) => {
  const { avatar_id } = req.params as { avatar_id: string };
  const parsed = livenessSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const db = loadDb();
  const avatar = db.avatars.find((a) => a.avatar_id === avatar_id);
  if (!avatar) return reply.code(404).send({ error: 'avatar_not_found' });
  if (avatar.status !== 'QC_OK') return reply.code(409).send({ error: 'qc_required' });
  const pass = parsed.data.response_text.toLowerCase().includes(parsed.data.challenge_text.toLowerCase());
  avatar.status = pass ? 'LIVENESS_OK' : 'FAILED';
  avatar.verified = pass;
  saveDb(db);
  return { avatar, anti_replay: true };
});

app.post('/avatars/:avatar_id/build', async (req, reply) => {
  const { avatar_id } = req.params as { avatar_id: string };
  const db = loadDb();
  const avatar = db.avatars.find((a) => a.avatar_id === avatar_id);
  if (!avatar) return reply.code(404).send({ error: 'avatar_not_found' });
  if (avatar.status !== 'LIVENESS_OK') return reply.code(409).send({ error: 'liveness_required' });
  avatar.status = 'BUILDING';
  if (env.MOCK_MEDIA_PIPELINE === 'true') {
    avatar.status = 'READY';
  }
  saveDb(db);
  return { avatar, mode: env.MOCK_MEDIA_PIPELINE === 'true' ? 'mock' : 'production' };
});

app.get('/avatars/:avatar_id', async (req, reply) => {
  const { avatar_id } = req.params as { avatar_id: string };
  const avatar = loadDb().avatars.find((a) => a.avatar_id === avatar_id);
  if (!avatar) return reply.code(404).send({ error: 'avatar_not_found' });
  return { avatar };
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
