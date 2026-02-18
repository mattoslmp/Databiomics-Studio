import Fastify from 'fastify';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  SERVICE_NAME: z.string()
});

const env = envSchema.parse({
  PORT: process.env.PORT,
  SERVICE_NAME: process.env.SERVICE_NAME ?? 'provenance'
});
const app = Fastify({ logger: { level: 'info' } });

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));

app.get('/v1/events/outbox', async () => ({
  event: 'provenance.initialized',
  message: 'Outbox event contract placeholder for NATS publication.'
}));

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
