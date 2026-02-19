import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const app = Fastify({ logger: { level: 'info' } });

const models = [
  { id: 'llama-3.2-1b-instruct', profile: 'microtasks', local: true },
  { id: 'llama-3.2-3b-instruct', profile: 'slides-summarization', local: true },
  {
    id: 'medgemma',
    profile: 'biomedical',
    local: true,
    warning: 'Apoio para leitura e sumarização; não é aconselhamento médico.'
  },
  { id: 'openai-adapter', profile: 'fallback-external', local: false },
  { id: 'deepseek-adapter', profile: 'fallback-external', local: false }
] as const;

type ModelId = (typeof models)[number]['id'];

const usageStore = new Map<
  string,
  { requests: number; tokens_in: number; tokens_out: number; external_requests: number }
>();

const outboxEvents: Array<{
  id: string;
  topic: 'llm.request.completed' | 'usage.metered';
  payload: Record<string, unknown>;
  created_at: string;
}> = [];

const routeSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  task_type: z.enum(['biomedical', 'general_summary', 'slides_generation', 'microtask']),
  prompt: z.string().min(3),
  policy_id: z.string().optional(),
  allow_external_llm: z.boolean().default(false)
});

function selectModel(
  taskType: z.infer<typeof routeSchema>['task_type'],
  allowExternal: boolean
): { model: ModelId; external: boolean } {
  if (taskType === 'biomedical') return { model: 'medgemma', external: false };
  if (taskType === 'microtask') return { model: 'llama-3.2-1b-instruct', external: false };
  if (allowExternal) return { model: 'openai-adapter', external: true };
  return { model: 'llama-3.2-3b-instruct', external: false };
}

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health' || req.url === '/metrics') return;
  const workspaceHeader = req.headers['x-workspace-id'];
  if (!workspaceHeader) {
    return reply.code(401).send({ error: 'missing_workspace_context' });
  }
});

app.get('/health', async () => ({ status: 'ok', service: 'llm-gateway' }));

app.get('/metrics', async () => ({
  service: 'llm-gateway',
  counters: {
    workspace_count: usageStore.size,
    outbox_depth: outboxEvents.length
  }
}));

app.get('/llm-gateway/models', async () => ({ models }));

app.post('/llm-gateway/route', async (req, reply) => {
  const parsed = routeSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const selected = selectModel(parsed.data.task_type, parsed.data.allow_external_llm);
  const tokensIn = Math.max(8, Math.round(parsed.data.prompt.length / 4));
  const tokensOut = Math.max(16, Math.round(tokensIn * 1.5));

  const usage = usageStore.get(parsed.data.workspace_id) ?? {
    requests: 0,
    tokens_in: 0,
    tokens_out: 0,
    external_requests: 0
  };
  usage.requests += 1;
  usage.tokens_in += tokensIn;
  usage.tokens_out += tokensOut;
  usage.external_requests += selected.external ? 1 : 0;
  usageStore.set(parsed.data.workspace_id, usage);

  const requestId = randomUUID();
  outboxEvents.push({
    id: randomUUID(),
    topic: 'llm.request.completed',
    payload: {
      request_id: requestId,
      workspace_id: parsed.data.workspace_id,
      user_id: parsed.data.user_id,
      task_type: parsed.data.task_type,
      model: selected.model,
      external_mode: selected.external,
      policy_id: parsed.data.policy_id ?? null
    },
    created_at: new Date().toISOString()
  });
  outboxEvents.push({
    id: randomUUID(),
    topic: 'usage.metered',
    payload: {
      workspace_id: parsed.data.workspace_id,
      meter: 'llm_tokens',
      tokens_in: tokensIn,
      tokens_out: tokensOut
    },
    created_at: new Date().toISOString()
  });

  return {
    request_id: requestId,
    task_type: parsed.data.task_type,
    selected_model: selected.model,
    external_mode: selected.external,
    policy_id: parsed.data.policy_id ?? null,
    output: {
      text: `Resposta gerada para task ${parsed.data.task_type} com modelo ${selected.model}`,
      citations: []
    },
    usage: { tokens_in: tokensIn, tokens_out: tokensOut }
  };
});

app.get('/llm-gateway/usage', async (req) => {
  const query = req.query as { workspace_id?: string };
  if (query.workspace_id) {
    return {
      workspace_id: query.workspace_id,
      usage: usageStore.get(query.workspace_id) ?? {
        requests: 0,
        tokens_in: 0,
        tokens_out: 0,
        external_requests: 0
      }
    };
  }
  return { usage: Object.fromEntries(usageStore.entries()) };
});

app.get('/llm-gateway/outbox', async () => ({
  total: outboxEvents.length,
  events: outboxEvents.slice(-50)
}));

const port = Number(process.env.PORT ?? 3011);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
