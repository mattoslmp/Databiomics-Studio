import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

type Deck = { deck_id: string; workspace_id: string; user_id: string; title: string; template: string; slides: { idx: number; content: string }[]; created_at: string };
type Db = { decks: Deck[] };
const dbPath = resolve(process.cwd(), 'services/deck/.data/decks.json');

const envSchema = z.object({ PORT: z.coerce.number().default(3000), SERVICE_NAME: z.string() });
const createSchema = z.object({ workspace_id: z.string(), user_id: z.string(), title: z.string(), template: z.string().default('EDU_AULA_10') });
const addSlideSchema = z.object({ content: z.string().min(1) });

const env = envSchema.parse({ PORT: process.env.PORT, SERVICE_NAME: process.env.SERVICE_NAME ?? 'deck' });
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db { try { return JSON.parse(readFileSync(dbPath, 'utf8')) as Db; } catch { return { decks: [] }; } }
function saveDb(db: Db): void { mkdirSync(dirname(dbPath), { recursive: true }); writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));
app.get('/v1/events/outbox', async () => ({ event: 'deck.initialized', message: 'Outbox event contract placeholder for NATS publication.' }));

app.get('/deck/templates', async () => ({
  categories: {
    educacao: ['Aula 10 min (3 slides)', 'Resumo de capítulo', 'Apresentação científica'],
    rh: ['Onboarding 5 min', 'Política/Compliance', 'Treinamento de segurança'],
    empresas: ['Ata em vídeo', 'Status report semanal', 'Pitch interno']
  }
}));

app.post('/decks', async (req, reply) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const deck: Deck = { deck_id: randomUUID(), slides: [], created_at: new Date().toISOString(), ...parsed.data };
  const db = loadDb();
  db.decks.push(deck);
  saveDb(db);
  return { deck };
});

app.post('/decks/:deck_id/slides', async (req, reply) => {
  const { deck_id } = req.params as { deck_id: string };
  const parsed = addSlideSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const db = loadDb();
  const deck = db.decks.find((d) => d.deck_id === deck_id);
  if (!deck) return reply.code(404).send({ error: 'deck_not_found' });
  deck.slides.push({ idx: deck.slides.length, content: parsed.data.content });
  saveDb(db);
  return { deck };
});

app.get('/decks/:deck_id/export', async (req, reply) => {
  const { deck_id } = req.params as { deck_id: string };
  const query = req.query as { format?: 'pdf' | 'pptx' | 'png' };
  const deck = loadDb().decks.find((d) => d.deck_id === deck_id);
  if (!deck) return reply.code(404).send({ error: 'deck_not_found' });
  const format = query.format ?? 'pdf';
  return { deck_id, format, output_ref: `s3://mock-deck/${deck_id}.${format}` };
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
