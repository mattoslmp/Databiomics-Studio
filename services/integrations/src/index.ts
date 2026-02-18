import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

type ImportRecord = { id: string; workspace_id: string; source: 'link' | 'upload'; source_ref: string; created_at: string };
type ExportRecord = { id: string; workspace_id: string; type: 'notes' | 'tasks'; format: 'pdf' | 'docx' | 'csv' | 'json'; created_at: string };
type Db = { imports: ImportRecord[]; exports: ExportRecord[] };

const dbPath = resolve(process.cwd(), 'services/integrations/.data/integrations.json');
const envSchema = z.object({ PORT: z.coerce.number().default(3000), SERVICE_NAME: z.string() });
const importSchema = z.object({ workspace_id: z.string().min(1), source: z.enum(['link', 'upload']), source_ref: z.string().min(3) });
const exportSchema = z.object({ workspace_id: z.string().min(1), type: z.enum(['notes', 'tasks']), format: z.enum(['pdf', 'docx', 'csv', 'json']) });

const env = envSchema.parse({ PORT: process.env.PORT, SERVICE_NAME: process.env.SERVICE_NAME ?? 'integrations' });
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db { try { return JSON.parse(readFileSync(dbPath, 'utf8')) as Db; } catch { return { imports: [], exports: [] }; } }
function saveDb(db: Db): void { mkdirSync(dirname(dbPath), { recursive: true }); writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));
app.get('/v1/events/outbox', async () => ({ event: 'integrations.initialized', message: 'Outbox event contract placeholder for NATS publication.' }));

app.post('/integrations/import', async (req, reply) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const record: ImportRecord = { id: randomUUID(), ...parsed.data, created_at: new Date().toISOString() };
  const db = loadDb();
  db.imports.push(record);
  saveDb(db);
  return { import_job: record };
});

app.post('/integrations/export', async (req, reply) => {
  const parsed = exportSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const record: ExportRecord = { id: randomUUID(), ...parsed.data, created_at: new Date().toISOString() };
  const db = loadDb();
  db.exports.push(record);
  saveDb(db);
  return { export_job: record };
});

app.get('/integrations/jobs', async () => {
  const db = loadDb();
  return { imports: db.imports, exports: db.exports };
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
