import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

type Task = { id: string; meeting_id: string; text: string; status: 'backlog' | 'doing' | 'done'; owner_id?: string; created_at: string };
type Decision = { id: string; meeting_id: string; text: string; status: 'open' | 'approved'; created_at: string };
type Risk = { id: string; meeting_id: string; text: string; severity: 'low' | 'medium' | 'high'; created_at: string };
type OpenQuestion = { id: string; meeting_id: string; text: string; created_at: string };
type Db = { tasks: Task[]; decisions: Decision[]; risks: Risk[]; questions: OpenQuestion[] };

const dbPath = resolve(process.cwd(), 'services/execution/.data/execution.json');
const envSchema = z.object({ PORT: z.coerce.number().default(3000), SERVICE_NAME: z.string() });
const genSchema = z.object({ meeting_id: z.string().min(1), transcript_text: z.string().min(10), owner_id: z.string().optional() });

const env = envSchema.parse({ PORT: process.env.PORT, SERVICE_NAME: process.env.SERVICE_NAME ?? 'execution' });
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db { try { return JSON.parse(readFileSync(dbPath, 'utf8')) as Db; } catch { return { tasks: [], decisions: [], risks: [], questions: [] }; } }
function saveDb(db: Db): void { mkdirSync(dirname(dbPath), { recursive: true }); writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

function lines(text: string): string[] {
  return text.split(/[.!?]\s+/).map((x) => x.trim()).filter((x) => x.length > 0);
}

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));
app.get('/v1/events/outbox', async () => ({ event: 'execution.initialized', message: 'Outbox event contract placeholder for NATS publication.' }));

app.post('/execution/generate', async (req, reply) => {
  const parsed = genSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const now = new Date().toISOString();
  const sentences = lines(parsed.data.transcript_text);

  const tasks: Task[] = sentences.slice(0, 3).map((t) => ({ id: randomUUID(), meeting_id: parsed.data.meeting_id, text: t, status: 'backlog', owner_id: parsed.data.owner_id, created_at: now }));
  const decisions: Decision[] = sentences.slice(3, 5).map((t) => ({ id: randomUUID(), meeting_id: parsed.data.meeting_id, text: t, status: 'open', created_at: now }));
  const risks: Risk[] = sentences.filter((s) => /risco|risk|bloqueio|impedimento/i.test(s)).slice(0, 2).map((t) => ({ id: randomUUID(), meeting_id: parsed.data.meeting_id, text: t, severity: 'medium', created_at: now }));
  const questions: OpenQuestion[] = sentences.filter((s) => s.includes('?')).map((t) => ({ id: randomUUID(), meeting_id: parsed.data.meeting_id, text: t, created_at: now }));

  const db = loadDb();
  db.tasks.push(...tasks);
  db.decisions.push(...decisions);
  db.risks.push(...risks);
  db.questions.push(...questions);
  saveDb(db);

  return { meeting_id: parsed.data.meeting_id, tasks, decisions, risks, open_questions: questions };
});

app.get('/execution/:meeting_id', async (req) => {
  const { meeting_id } = req.params as { meeting_id: string };
  const db = loadDb();
  return {
    meeting_id,
    tasks: db.tasks.filter((x) => x.meeting_id === meeting_id),
    decisions: db.decisions.filter((x) => x.meeting_id === meeting_id),
    risks: db.risks.filter((x) => x.meeting_id === meeting_id),
    open_questions: db.questions.filter((x) => x.meeting_id === meeting_id)
  };
});

app.get('/execution/:meeting_id/export', async (req) => {
  const { meeting_id } = req.params as { meeting_id: string };
  const query = req.query as { format?: 'json' | 'csv' };
  const db = loadDb();
  const payload = {
    tasks: db.tasks.filter((x) => x.meeting_id === meeting_id),
    decisions: db.decisions.filter((x) => x.meeting_id === meeting_id),
    risks: db.risks.filter((x) => x.meeting_id === meeting_id),
    open_questions: db.questions.filter((x) => x.meeting_id === meeting_id)
  };
  if (query.format === 'csv') {
    const csv = ['type,text,status'].concat(
      payload.tasks.map((t) => `task,"${t.text.replace(/"/g, '""')}",${t.status}`),
      payload.decisions.map((d) => `decision,"${d.text.replace(/"/g, '""')}",${d.status}`),
      payload.risks.map((r) => `risk,"${r.text.replace(/"/g, '""')}",${r.severity}`),
      payload.open_questions.map((q) => `open_question,"${q.text.replace(/"/g, '""')}",open`)
    ).join('\n');
    return { format: 'csv', content: csv };
  }
  return { format: 'json', content: payload };
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
