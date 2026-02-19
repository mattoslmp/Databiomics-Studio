import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

type RenderJob = {
  job_id: string;
  workspace_id: string;
  user_id: string;
  avatar_id: string;
  deck_id: string;
  preset: 'FAST' | 'PRO';
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  content_id?: string;
  output_mp4_url?: string;
  verify_url?: string;
  watermark: boolean;
  created_at: string;
};

type Db = { jobs: RenderJob[] };
const dbPath = resolve(process.cwd(), 'services/render/.data/render-jobs.json');

const envSchema = z.object({ PORT: z.coerce.number().default(3000), SERVICE_NAME: z.string(), MOCK_MEDIA_PIPELINE: z.string().default('true') });
const createSchema = z.object({ workspace_id: z.string(), user_id: z.string(), avatar_id: z.string(), deck_id: z.string(), preset: z.enum(['FAST', 'PRO']).default('FAST') });

const env = envSchema.parse({ PORT: process.env.PORT, SERVICE_NAME: process.env.SERVICE_NAME ?? 'render', MOCK_MEDIA_PIPELINE: process.env.MOCK_MEDIA_PIPELINE ?? 'true' });
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db { try { return JSON.parse(readFileSync(dbPath, 'utf8')) as Db; } catch { return { jobs: [] }; } }
function saveDb(db: Db): void { mkdirSync(dirname(dbPath), { recursive: true }); writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME, mock_media_pipeline: env.MOCK_MEDIA_PIPELINE === 'true' }));
app.get('/v1/events/outbox', async () => ({ event: 'render.initialized', message: 'Outbox event contract placeholder for NATS publication.' }));

app.post('/render/jobs', async (req, reply) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const job: RenderJob = {
    job_id: randomUUID(),
    status: 'queued',
    watermark: true,
    created_at: new Date().toISOString(),
    ...parsed.data
  };

  if (env.MOCK_MEDIA_PIPELINE === 'true') {
    job.status = 'completed';
    job.content_id = randomUUID();
    job.output_mp4_url = `s3://mock-render/${job.content_id}.mp4`;
    job.verify_url = `/verify/${job.content_id}`;
  } else {
    job.status = 'rendering';
  }

  const db = loadDb();
  db.jobs.push(job);
  saveDb(db);
  return { job };
});

app.get('/render/jobs/:job_id', async (req, reply) => {
  const { job_id } = req.params as { job_id: string };
  const job = loadDb().jobs.find((j) => j.job_id === job_id);
  if (!job) return reply.code(404).send({ error: 'job_not_found' });
  return { job };
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
