import Fastify from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const app = Fastify({ logger: { level: 'info' } });

const documents = new Map<
  string,
  {
    id: string;
    workspace_id: string;
    source_type: string;
    source_ref: string;
    title: string;
    content_hash: string;
  }
>();

const chunks = new Map<
  string,
  {
    id: string;
    doc_id: string;
    content: string;
    section?: string;
    page_ref?: string;
    citation: string;
  }
>();

const outboxEvents: Array<{
  id: string;
  topic: 'rag.document.ingested' | 'rag.index.updated';
  payload: Record<string, unknown>;
  created_at: string;
}> = [];

const ingestSchema = z.object({
  workspace_id: z.string().min(1),
  source_type: z.enum(['paper', 'transcript', 'notes', 'upload']),
  source_ref: z.string().min(1),
  title: z.string().min(3),
  content: z.string().min(20),
  section: z.string().optional(),
  page_ref: z.string().optional()
});

const retrieveSchema = z.object({
  workspace_id: z.string().min(1),
  question: z.string().min(3),
  top_k: z.coerce.number().min(1).max(20).default(5)
});

function score(query: string, text: string): number {
  const tokens = query.toLowerCase().split(/\W+/).filter(Boolean);
  const base = text.toLowerCase();
  return tokens.reduce((acc, token) => acc + (base.includes(token) ? 1 : 0), 0);
}

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health' || req.url === '/metrics') return;
  const workspaceHeader = req.headers['x-workspace-id'];
  if (!workspaceHeader) {
    return reply.code(401).send({ error: 'missing_workspace_context' });
  }
});

app.get('/health', async () => ({ status: 'ok', service: 'rag' }));

app.get('/metrics', async () => ({
  service: 'rag',
  counters: {
    documents: documents.size,
    chunks: chunks.size,
    outbox_depth: outboxEvents.length
  }
}));

app.post('/rag/ingest', async (req, reply) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const docId = randomUUID();
  const contentHash = createHash('sha256').update(parsed.data.content).digest('hex');
  documents.set(docId, {
    id: docId,
    workspace_id: parsed.data.workspace_id,
    source_type: parsed.data.source_type,
    source_ref: parsed.data.source_ref,
    title: parsed.data.title,
    content_hash: contentHash
  });

  const pieces =
    parsed.data.content
      .match(/[^.!?]+[.!?]?/g)
      ?.map((piece) => piece.trim())
      .filter(Boolean) ?? [parsed.data.content];

  const createdChunks = pieces.slice(0, 20).map((piece, index) => {
    const chunkId = randomUUID();
    const citation = `${parsed.data.source_type}:${parsed.data.source_ref}#chunk-${index + 1}`;
    const chunk = {
      id: chunkId,
      doc_id: docId,
      content: piece,
      section: parsed.data.section,
      page_ref: parsed.data.page_ref,
      citation
    };
    chunks.set(chunkId, chunk);
    return chunk;
  });

  outboxEvents.push({
    id: randomUUID(),
    topic: 'rag.document.ingested',
    payload: {
      workspace_id: parsed.data.workspace_id,
      doc_id: docId,
      source_ref: parsed.data.source_ref,
      chunk_count: createdChunks.length
    },
    created_at: new Date().toISOString()
  });
  outboxEvents.push({
    id: randomUUID(),
    topic: 'rag.index.updated',
    payload: {
      workspace_id: parsed.data.workspace_id,
      doc_id: docId,
      content_hash: contentHash
    },
    created_at: new Date().toISOString()
  });

  return {
    document: documents.get(docId),
    chunks_created: createdChunks.length,
    citations: createdChunks.map((chunk) => ({
      chunk_id: chunk.id,
      citation: chunk.citation,
      snippet: chunk.content.slice(0, 140)
    }))
  };
});

app.post('/rag/retrieve', async (req, reply) => {
  const parsed = retrieveSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const pool = Array.from(chunks.values()).filter((chunk) => {
    const doc = documents.get(chunk.doc_id);
    return doc?.workspace_id === parsed.data.workspace_id;
  });

  if (pool.length === 0) {
    return reply.code(404).send({
      error: 'no_context',
      message: 'não encontrei no material fornecido',
      suggestion: 'anexe paper/PDF ou transcrição para habilitar RAG grounded'
    });
  }

  const ranked = pool
    .map((chunk) => ({ chunk, score: score(parsed.data.question, chunk.content) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, parsed.data.top_k)
    .map(({ chunk, score: chunkScore }) => {
      const doc = documents.get(chunk.doc_id);
      return {
        chunk_id: chunk.id,
        doc_id: chunk.doc_id,
        title: doc?.title,
        score: chunkScore,
        snippet: chunk.content,
        citation: chunk.citation,
        open_link: doc ? `/rag/documents/${doc.id}` : null,
        page_ref: chunk.page_ref ?? null
      };
    });

  return {
    question: parsed.data.question,
    top_k: parsed.data.top_k,
    citations: ranked
  };
});

app.get('/rag/outbox', async () => ({
  total: outboxEvents.length,
  events: outboxEvents.slice(-50)
}));

const port = Number(process.env.PORT ?? 3012);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
