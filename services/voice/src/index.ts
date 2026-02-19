import Fastify from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
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

type SpeechJob = {
  job_id: string;
  workspace_id: string;
  user_id: string;
  source: 'raw_text' | 'slides';
  mode: 'tts' | 'clone';
  status: 'queued' | 'completed';
  text_hash: string;
  text_preview: string;
  audio_ref: string;
  created_at: string;
};

type OutboxEvent = {
  id: string;
  topic: 'voice.profile.verified' | 'voice.speech.generated' | 'usage.metered';
  payload: Record<string, unknown>;
  created_at: string;
};

type Db = { profiles: VoiceProfile[]; speech_jobs: SpeechJob[]; outbox: OutboxEvent[] };
const dbPath = resolve(process.cwd(), 'services/voice/.data/voice.json');

const envSchema = z.object({ PORT: z.coerce.number().default(3000), SERVICE_NAME: z.string() });
const createSchema = z.object({
  user_id: z.string().min(1),
  workspace_id: z.string().min(1),
  watermark_enabled: z.boolean().default(true)
});
const verifySchema = z.object({ challenge_text: z.string().min(3), response_text: z.string().min(3) });
const synthSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  mode: z.enum(['tts', 'clone']),
  text: z.string().min(1),
  voice_profile_id: z.string().optional(),
  plan: z.enum(['free', 'creator', 'pro']).default('free')
});
const slideSynthSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  mode: z.enum(['tts', 'clone']),
  plan: z.enum(['free', 'creator', 'pro']).default('free'),
  voice_profile_id: z.string().optional(),
  slide_blocks: z.array(z.object({ slide_id: z.string().min(1), title: z.string().min(1), notes: z.string().min(1) })).min(1)
});

const env = envSchema.parse({ PORT: process.env.PORT, SERVICE_NAME: process.env.SERVICE_NAME ?? 'voice' });
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db {
  try {
    return JSON.parse(readFileSync(dbPath, 'utf8')) as Db;
  } catch {
    return { profiles: [], speech_jobs: [], outbox: [] };
  }
}

function saveDb(db: Db): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function pushEvent(db: Db, event: OutboxEvent): void {
  db.outbox.push(event);
}

function assertCloneAllowed(db: Db, mode: 'tts' | 'clone', plan: 'free' | 'creator' | 'pro', voiceProfileId?: string): void {
  if (mode !== 'clone') return;
  if (plan !== 'pro') throw new Error('clone_requires_pro_plan');
  const profile = db.profiles.find((item) => item.voice_profile_id === voiceProfileId);
  if (!profile?.verified) throw new Error('voice_verification_required');
}

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health' || req.url === '/metrics') return;
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_bearer_token' });
  const workspace = req.headers['x-workspace-id'];
  if (!workspace) return reply.code(401).send({ error: 'missing_workspace_context' });
});

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));

app.get('/metrics', async () => {
  const db = loadDb();
  return {
    service: env.SERVICE_NAME,
    counters: {
      profiles_total: db.profiles.length,
      speech_jobs_total: db.speech_jobs.length,
      outbox_depth: db.outbox.length
    }
  };
});

app.get('/v1/events/outbox', async () => {
  const db = loadDb();
  return { total: db.outbox.length, events: db.outbox.slice(-100) };
});

app.post('/voice/profiles', async (req, reply) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const profile: VoiceProfile = {
    voice_profile_id: randomUUID(),
    verified: false,
    created_at: new Date().toISOString(),
    ...parsed.data
  };

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
  const profile = db.profiles.find((item) => item.voice_profile_id === voice_profile_id);
  if (!profile) return reply.code(404).send({ error: 'voice_profile_not_found' });

  profile.verified = parsed.data.response_text.toLowerCase().includes(parsed.data.challenge_text.toLowerCase());
  pushEvent(db, {
    id: randomUUID(),
    topic: 'voice.profile.verified',
    payload: { voice_profile_id, verified: profile.verified },
    created_at: new Date().toISOString()
  });
  saveDb(db);
  return { profile, anti_replay: true };
});

app.post('/voice/synthesize', async (req, reply) => {
  const parsed = synthSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const db = loadDb();
  try {
    assertCloneAllowed(db, parsed.data.mode, parsed.data.plan, parsed.data.voice_profile_id);
  } catch (error) {
    return reply.code(403).send({ error: (error as Error).message });
  }

  const job: SpeechJob = {
    job_id: randomUUID(),
    workspace_id: parsed.data.workspace_id,
    user_id: parsed.data.user_id,
    source: 'raw_text',
    mode: parsed.data.mode,
    status: 'completed',
    text_hash: createHash('sha256').update(parsed.data.text).digest('hex'),
    text_preview: parsed.data.text.slice(0, 140),
    audio_ref: `s3://mock-audio/${randomUUID()}.wav`,
    created_at: new Date().toISOString()
  };
  db.speech_jobs.push(job);
  pushEvent(db, {
    id: randomUUID(),
    topic: 'voice.speech.generated',
    payload: { job_id: job.job_id, mode: job.mode, source: job.source, workspace_id: job.workspace_id },
    created_at: new Date().toISOString()
  });
  pushEvent(db, {
    id: randomUUID(),
    topic: 'usage.metered',
    payload: { workspace_id: job.workspace_id, meter: 'voice_chars', value: parsed.data.text.length },
    created_at: new Date().toISOString()
  });
  saveDb(db);

  return {
    mode: parsed.data.mode,
    text: parsed.data.text,
    audio_ref: job.audio_ref,
    sample_rate: 48000,
    watermark_audio: parsed.data.mode === 'clone',
    speech_job: job
  };
});

app.post('/voice/synthesize-from-slides', async (req, reply) => {
  const parsed = slideSynthSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const fullText = parsed.data.slide_blocks
    .map((item, index) => `Slide ${index + 1}: ${item.title}. ${item.notes}`)
    .join(' ');

  const db = loadDb();
  try {
    assertCloneAllowed(db, parsed.data.mode, parsed.data.plan, parsed.data.voice_profile_id);
  } catch (error) {
    return reply.code(403).send({ error: (error as Error).message });
  }

  const job: SpeechJob = {
    job_id: randomUUID(),
    workspace_id: parsed.data.workspace_id,
    user_id: parsed.data.user_id,
    source: 'slides',
    mode: parsed.data.mode,
    status: 'completed',
    text_hash: createHash('sha256').update(fullText).digest('hex'),
    text_preview: fullText.slice(0, 140),
    audio_ref: `s3://mock-audio/${randomUUID()}.wav`,
    created_at: new Date().toISOString()
  };

  db.speech_jobs.push(job);
  pushEvent(db, {
    id: randomUUID(),
    topic: 'voice.speech.generated',
    payload: { job_id: job.job_id, mode: job.mode, source: job.source, workspace_id: job.workspace_id },
    created_at: new Date().toISOString()
  });
  pushEvent(db, {
    id: randomUUID(),
    topic: 'usage.metered',
    payload: { workspace_id: job.workspace_id, meter: 'voice_chars', value: fullText.length },
    created_at: new Date().toISOString()
  });
  saveDb(db);

  return {
    source: 'slides',
    slide_count: parsed.data.slide_blocks.length,
    composed_text_preview: fullText.slice(0, 300),
    audio_ref: job.audio_ref,
    speech_job: job
  };
});

app.get('/voice/jobs/:job_id', async (req, reply) => {
  const { job_id } = req.params as { job_id: string };
  const job = loadDb().speech_jobs.find((item) => item.job_id === job_id);
  if (!job) return reply.code(404).send({ error: 'speech_job_not_found' });
  return { speech_job: job };
});

app.listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => app.log.info({ service: env.SERVICE_NAME }, 'service started'))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
