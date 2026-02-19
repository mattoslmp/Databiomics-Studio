import Fastify from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

type SharePage = { id: string; slug: string; content_id: string; workspace_id: string; created_at: string; visibility: 'public' | 'private'; disclosure: string };
type ReferralEvent = { id: string; referrer_id: string; referee_id: string; ip_hash: string; created_at: string; status: 'applied' | 'blocked' };
type UsageCredit = { workspace_id: string; user_id: string; metric: 'video_min'; amount: number; created_at: string; reason: string };
type Db = { shares: SharePage[]; referrals: ReferralEvent[]; credits: UsageCredit[] };

const dbPath = resolve(process.cwd(), 'services/growth/.data/growth.json');
const cooldownMs = 1000 * 60 * 60 * 24;

const envSchema = z.object({ PORT: z.coerce.number().default(3000), SERVICE_NAME: z.string() });
const shareSchema = z.object({ content_id: z.string().min(3), workspace_id: z.string().min(1), visibility: z.enum(['public', 'private']).default('public') });
const referralSchema = z.object({ referrer_id: z.string().min(1), referee_id: z.string().min(1), ip: z.string().min(3) });

const env = envSchema.parse({ PORT: process.env.PORT, SERVICE_NAME: process.env.SERVICE_NAME ?? 'growth' });
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db { try { return JSON.parse(readFileSync(dbPath, 'utf8')) as Db; } catch { return { shares: [], referrals: [], credits: [] }; } }
function saveDb(db: Db): void { mkdirSync(dirname(dbPath), { recursive: true }); writeFileSync(dbPath, JSON.stringify(db, null, 2)); }
function ipHash(ip: string): string { return createHash('sha256').update(ip).digest('hex'); }

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));
app.get('/v1/events/outbox', async () => ({ event: 'growth.initialized', message: 'Outbox event contract placeholder for NATS publication.' }));

app.post('/growth/share-pages', async (req, reply) => {
  const parsed = shareSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const slug = randomUUID().slice(0, 8);
  const share: SharePage = {
    id: randomUUID(),
    slug,
    content_id: parsed.data.content_id,
    workspace_id: parsed.data.workspace_id,
    created_at: new Date().toISOString(),
    visibility: parsed.data.visibility,
    disclosure: 'conteúdo sintético / avatar virtual'
  };
  const db = loadDb();
  db.shares.push(share);
  saveDb(db);
  return { share_url: `/share/${slug}`, share };
});

app.get('/share/:slug', async (req, reply) => {
  const { slug } = req.params as { slug: string };
  const db = loadDb();
  const share = db.shares.find((s) => s.slug === slug && s.visibility === 'public');
  if (!share) return reply.code(404).send({ error: 'share_not_found' });
  return {
    content_id: share.content_id,
    created_at: share.created_at,
    verify_url: `/verify/${share.content_id}`,
    disclosure: share.disclosure,
    brand: 'Databiomics Studio'
  };
});

app.post('/growth/referrals/apply', async (req, reply) => {
  const parsed = referralSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const ip_hash = ipHash(parsed.data.ip);
  const db = loadDb();

  const last = db.referrals.find((r) => r.ip_hash === ip_hash && r.referrer_id === parsed.data.referrer_id);
  const now = Date.now();
  const blocked = Boolean(last && now - new Date(last.created_at).getTime() < cooldownMs);

  const event: ReferralEvent = {
    id: randomUUID(),
    referrer_id: parsed.data.referrer_id,
    referee_id: parsed.data.referee_id,
    ip_hash,
    created_at: new Date().toISOString(),
    status: blocked ? 'blocked' : 'applied'
  };
  db.referrals.push(event);

  if (!blocked) {
    db.credits.push(
      { workspace_id: parsed.data.referrer_id, user_id: parsed.data.referrer_id, metric: 'video_min', amount: 10, created_at: new Date().toISOString(), reason: 'referral_bonus_referrer' },
      { workspace_id: parsed.data.referee_id, user_id: parsed.data.referee_id, metric: 'video_min', amount: 10, created_at: new Date().toISOString(), reason: 'referral_bonus_referee' }
    );
  }

  saveDb(db);
  return { event, credits_granted: blocked ? 0 : 20 };
});

app.get('/growth/credits/:user_id', async (req) => {
  const { user_id } = req.params as { user_id: string };
  const db = loadDb();
  return { credits: db.credits.filter((c) => c.user_id === user_id) };
});

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health' || req.url.startsWith('/share/')) return;
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
