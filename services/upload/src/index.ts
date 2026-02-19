import Fastify from 'fastify';
import { z } from 'zod';
import { appendUploadChunk, createUploadSession, finalizeUpload, getUploadSession } from './store.js';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  SERVICE_NAME: z.string()
});

const createSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  upload_type: z.enum(['avatar', 'audio', 'video', 'deck_asset']),
  expected_size: z.coerce.number().int().positive(),
  metadata: z.record(z.string()).optional()
});

const finalizeSchema = z.object({
  sha256: z.string().length(64).optional()
});

const env = envSchema.parse({
  PORT: process.env.PORT,
  SERVICE_NAME: process.env.SERVICE_NAME ?? 'upload'
});
const app = Fastify({ logger: { level: 'info' } });


app.addContentTypeParser('application/offset+octet-stream', { parseAs: 'buffer' }, (_req, body, done) => {
  done(null, body);
});

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));

app.get('/v1/events/outbox', async () => ({
  event: 'upload.initialized',
  message: 'Outbox event contract placeholder for NATS publication.'
}));

app.post('/uploads/tus', async (req, reply) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const session = createUploadSession(parsed.data);
  reply.header('Location', `/uploads/tus/${session.id}`);
  reply.header('Tus-Resumable', '1.0.0');
  reply.header('Upload-Offset', '0');
  return { session_id: session.id, upload_url: `/uploads/tus/${session.id}` };
});

app.head('/uploads/tus/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const session = getUploadSession(id);
  if (!session) return reply.code(404).send();
  reply.header('Tus-Resumable', '1.0.0');
  reply.header('Upload-Offset', String(session.received_size));
  reply.header('Upload-Length', String(session.expected_size));
  return reply.code(204).send();
});

app.patch('/uploads/tus/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const offsetHeader = req.headers['upload-offset'];
  const offset = Number(offsetHeader ?? 0);
  if (Number.isNaN(offset)) return reply.code(400).send({ error: 'invalid_upload_offset' });

  const body = (req.body as Buffer | string | undefined) ?? Buffer.alloc(0);
  const chunk = Buffer.isBuffer(body) ? body : Buffer.from(body);

  try {
    const session = appendUploadChunk(id, offset, chunk);
    if (!session) return reply.code(404).send({ error: 'upload_not_found' });
    reply.header('Tus-Resumable', '1.0.0');
    reply.header('Upload-Offset', String(session.received_size));
    return reply.code(204).send();
  } catch (error) {
    return reply.code(409).send({ error: (error as Error).message });
  }
});

app.post('/uploads/tus/:id/complete', async (req, reply) => {
  const { id } = req.params as { id: string };
  const parsed = finalizeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const session = finalizeUpload(id, parsed.data.sha256);
  if (!session) return reply.code(404).send({ error: 'upload_not_found' });
  return { session };
});

app.get('/uploads/sessions/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const session = getUploadSession(id);
  if (!session) return reply.code(404).send({ error: 'upload_not_found' });
  return { session };
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
