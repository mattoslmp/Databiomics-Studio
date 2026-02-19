import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

type VoiceProfile = {
  voice_profile_id: string;
  user_id: string;
  workspace_id: string;
  verified: boolean;
  watermark_enabled: boolean;
  created_at: string;
};

type Db = { profiles: VoiceProfile[] };
const dbPath = resolve(process.cwd(), 'services/voice/.data/voice.json');

const envSchema = z.object({ PORT: z.coerce.number().default(3000), SERVICE_NAME: z.string() });
const createSchema = z.object({ user_id: z.string(), workspace_id: z.string(), watermark_enabled: z.boolean().default(true) });
const verifySchema = z.object({ challenge_text: z.string(), response_text: z.string() });
const synthSchema = z.object({ mode: z.enum(['tts', 'clone']), text: z.string().min(1), voice_profile_id: z.string().optional(), plan: z.enum(['free', 'creator', 'pro']).default('free') });

const env = envSchema.parse({ PORT: process.env.PORT, SERVICE_NAME: process.env.SERVICE_NAME ?? 'voice' });
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db { try { return JSON.parse(readFileSync(dbPath, 'utf8')) as Db; } catch { return { profiles: [] }; } }
function saveDb(db: Db): void { mkdirSync(dirname(dbPath), { recursive: true }); writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));
app.get('/v1/events/outbox', async () => ({ event: 'voice.initialized', message: 'Outbox event contract placeholder for NATS publication.' }));

app.post('/voice/profiles', async (req, reply) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const profile: VoiceProfile = { voice_profile_id: randomUUID(), verified: false, created_at: new Date().toISOString(), ...parsed.data };
  const db = loadDb();
  db.profiles.push(profile);
  saveDb(db);
  return { profile };
});

app.post('/voice/profiles/:voice_profile_id/verify', async (req, reply) => {
  const { voice_profile_id } = req.params as { voice_profile_id: string };
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const db = loadDb();
  const profile = db.profiles.find((p) => p.voice_profile_id === voice_profile_id);
  if (!profile) return reply.code(404).send({ error: 'voice_profile_not_found' });
  profile.verified = parsed.data.response_text.toLowerCase().includes(parsed.data.challenge_text.toLowerCase());
  saveDb(db);
  return { profile, anti_replay: true };
});

app.post('/voice/synthesize', async (req, reply) => {
  const parsed = synthSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  if (parsed.data.mode === 'clone') {
    if (parsed.data.plan !== 'pro') return reply.code(403).send({ error: 'clone_requires_pro_plan' });
    const profile = loadDb().profiles.find((p) => p.voice_profile_id === parsed.data.voice_profile_id);
    if (!profile?.verified) return reply.code(403).send({ error: 'voice_verification_required' });
  }

  return {
    mode: parsed.data.mode,
    text: parsed.data.text,
    audio_ref: `s3://mock-audio/${randomUUID()}.wav`,
    sample_rate: 48000,
    watermark_audio: parsed.data.mode === 'clone'
  };
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
