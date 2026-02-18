import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

type LlamaModelId = 'llama-3.2-1b-instruct' | 'llama-3.2-3b-instruct';

type ModelRecord = {
  id: LlamaModelId;
  title: string;
  provider: 'meta';
  sizeLabel: '1B' | '3B';
  status: 'available' | 'downloading' | 'installed';
  downloadSource: 'huggingface';
  localPath?: string;
  updatedAt: string;
};

const modelCatalog = new Map<LlamaModelId, ModelRecord>([
  ['llama-3.2-1b-instruct', {
    id: 'llama-3.2-1b-instruct',
    title: 'Llama 3.2 1B Instruct',
    provider: 'meta',
    sizeLabel: '1B',
    status: 'available',
    downloadSource: 'huggingface',
    updatedAt: new Date().toISOString()
  }],
  ['llama-3.2-3b-instruct', {
    id: 'llama-3.2-3b-instruct',
    title: 'Llama 3.2 3B Instruct',
    provider: 'meta',
    sizeLabel: '3B',
    status: 'available',
    downloadSource: 'huggingface',
    updatedAt: new Date().toISOString()
  }]
]);

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  SERVICE_NAME: z.string()
});

const triggerDownloadSchema = z.object({
  model_id: z.enum(['llama-3.2-1b-instruct', 'llama-3.2-3b-instruct']),
  transport: z.enum(['ui', 'python-client']).default('ui')
});

const env = envSchema.parse({
  PORT: process.env.PORT,
  SERVICE_NAME: process.env.SERVICE_NAME ?? 'admin'
});
const app = Fastify({ logger: { level: 'info' } });

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));

app.get('/v1/events/outbox', async () => ({
  event: 'admin.initialized',
  message: 'Outbox event contract placeholder for NATS publication.'
}));

app.get('/admin/models', async () => ({
  models: Array.from(modelCatalog.values())
}));

app.post('/admin/models/download', async (req) => {
  const payload = triggerDownloadSchema.parse(req.body);
  const target = modelCatalog.get(payload.model_id);
  if (!target) {
    return {
      ok: false,
      error_code: 'MODEL_NOT_SUPPORTED',
      allowed_models: Array.from(modelCatalog.keys())
    };
  }

  const updated: ModelRecord = {
    ...target,
    status: 'downloading',
    updatedAt: new Date().toISOString()
  };
  modelCatalog.set(payload.model_id, updated);

  const command = `python workers/research-worker-python/client/download_model.py --model ${payload.model_id}`;
  return {
    ok: true,
    job_id: randomUUID(),
    model: updated,
    triggered_by: payload.transport,
    python_client_command: command,
    note: 'No MVP, o endpoint registra a intenção de download. O worker Python executa o download real.'
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
