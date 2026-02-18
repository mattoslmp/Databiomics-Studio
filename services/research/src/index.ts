import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { generateInsights } from './llm.js';
import { attachItems, createSession, getSession, listSessions } from './session-store.js';
import { providerRegistry, type ResearchItem } from './providers.js';

const app = Fastify({ logger: { level: 'info' } });

const searchQuery = z.object({
  provider: z.string().default('fixture'),
  q: z.string().min(2),
  year_from: z.coerce.number().optional(),
  year_to: z.coerce.number().optional(),
  oa_only: z.coerce.boolean().optional(),
  type: z.enum(['article', 'preprint', 'dataset', 'book', 'thesis']).optional()
});

const createSessionSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  topic: z.string().min(3),
  model_id: z.string().min(2),
  provider: z.string().default('fixture')
});

const attachSchema = z.object({
  items: z.array(z.any()).min(1)
});

app.get('/health', async () => ({ status: 'ok', service: 'research' }));

app.get('/research/providers', async () =>
  Object.keys(providerRegistry).map((id) => ({ id, status: 'enabled' }))
);

app.get('/research/search', async (req, reply) => {
  const parsed = searchQuery.safeParse(req.query);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const adapter = providerRegistry[parsed.data.provider];
  if (!adapter) return reply.code(404).send({ error: 'provider_not_found' });

  const items = await adapter.search(parsed.data.q, {
    year_from: parsed.data.year_from,
    year_to: parsed.data.year_to,
    oa_only: parsed.data.oa_only,
    type: parsed.data.type
  });

  return {
    provider: adapter.id,
    total: items.length,
    items
  };
});

app.get('/research/item/:provider/:id', async (req, reply) => {
  const { provider, id } = req.params as { provider: string; id: string };
  const adapter = providerRegistry[provider];
  if (!adapter) return reply.code(404).send({ error: 'provider_not_found' });
  const item = await adapter.getItem(id);
  if (!item) return reply.code(404).send({ error: 'item_not_found' });
  return item;
});

app.post('/research/resolve-fulltext', async (req) => {
  const body = req.body as { item: ResearchItem };
  const item = body?.item;
  if (!item) return { status: 'invalid', reason: 'missing item payload' };

  if (item.oa_status === 'oa' && item.pdf_url) {
    return { status: 'allowed', reason: 'open access', pdf_url: item.pdf_url };
  }
  return {
    status: 'restricted',
    reason: 'Não OA / licença não permite download automático',
    open_url: item.url
  };
});

app.post('/research/sessions', async (req, reply) => {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const session = createSession({ id: randomUUID(), ...parsed.data });
  return { session };
});

app.get('/research/sessions', async (req) => {
  const query = req.query as { workspace_id?: string };
  return { sessions: listSessions(query.workspace_id) };
});

app.get('/research/sessions/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const session = getSession(id);
  if (!session) return reply.code(404).send({ error: 'session_not_found' });
  return { session };
});

app.post('/research/sessions/:id/attach', async (req, reply) => {
  const { id } = req.params as { id: string };
  const parsed = attachSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const updated = attachItems(id, parsed.data.items as ResearchItem[]);
  if (!updated) return reply.code(404).send({ error: 'session_not_found' });
  return { session: updated };
});

app.post('/research/sessions/:id/generate-insights', async (req, reply) => {
  const { id } = req.params as { id: string };
  const session = getSession(id);
  if (!session) return reply.code(404).send({ error: 'session_not_found' });
  if (session.attached_items.length === 0) {
    return reply.code(400).send({ error: 'no_attached_items' });
  }

  const result = await generateInsights({
    model: session.model_id,
    topic: session.topic,
    items: session.attached_items
  });

  return {
    session_id: session.id,
    model_id: session.model_id,
    engine: result.engine,
    bullets: result.bullets
  };
});

app.post('/deck/:deck_id/research/attach', async (req, reply) => {
  const body = req.body as { session_id: string; items: ResearchItem[] };
  if (!body?.session_id || !Array.isArray(body?.items)) {
    return reply.code(400).send({ error: 'invalid_payload' });
  }
  const session = attachItems(body.session_id, body.items);
  if (!session) return reply.code(404).send({ error: 'session_not_found' });
  return { attached: true, session_id: session.id, attached_items: session.attached_items.length };
});

app.post('/deck/:deck_id/research/summarize', async (req, reply) => {
  const body = req.body as { session_id: string };
  if (!body?.session_id) return reply.code(400).send({ error: 'session_id_required' });
  const session = getSession(body.session_id);
  if (!session) return reply.code(404).send({ error: 'session_not_found' });

  const result = await generateInsights({ model: session.model_id, topic: session.topic, items: session.attached_items });
  return { session_id: session.id, engine: result.engine, bullets: result.bullets };
});

app.get('/deck/:deck_id/references', async (req) => {
  const query = req.query as { session_id?: string };
  const session = query.session_id ? getSession(query.session_id) : null;
  return { references: session?.attached_items ?? [] };
});

app.post('/deck/:deck_id/references/export', async (req, reply) => {
  const body = req.body as { session_id: string; format?: 'bibtex' | 'csl-json' | 'ris' };
  const session = getSession(body?.session_id);
  if (!session) return reply.code(404).send({ error: 'session_not_found' });

  const format = body.format ?? 'bibtex';
  if (format === 'bibtex') {
    const bibtex = session.attached_items
      .map((item, i) => `@article{ref${i + 1},\n  title={${item.title}},\n  year={${item.year}},\n  url={${item.url}}\n}`)
      .join('\n\n');
    return { format, content: bibtex };
  }
  if (format === 'ris') {
    const ris = session.attached_items
      .map((item) => `TY  - JOUR\nTI  - ${item.title}\nPY  - ${item.year}\nUR  - ${item.url}\nER  -`)
      .join('\n\n');
    return { format, content: ris };
  }
  return {
    format,
    content: session.attached_items.map((item) => ({ title: item.title, year: item.year, url: item.url }))
  };
});

app.post('/deck/:deck_id/references/render-slides', async (req, reply) => {
  const body = req.body as { session_id: string };
  const session = getSession(body?.session_id);
  if (!session) return reply.code(404).send({ error: 'session_not_found' });
  const slideCount = Math.max(1, Math.ceil(session.attached_items.length / 5));
  return { generated_slides: slideCount, references_count: session.attached_items.length };
});

app.listen({ port: 3000, host: '0.0.0.0' });
