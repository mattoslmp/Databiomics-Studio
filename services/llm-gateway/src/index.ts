import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const app = Fastify({ logger: { level: 'info' } });

const models = [
  { id: 'llama-3.2-1b-instruct', profile: 'microtasks', local: true },
  { id: 'llama-3.2-3b-instruct', profile: 'slides-summarization', local: true },
  { id: 'medgemma', profile: 'biomedical', local: true, warning: 'Apoio para leitura e sumarização; não é aconselhamento médico.' },
  { id: 'openai-adapter', profile: 'fallback-external', local: false },
  { id: 'deepseek-adapter', profile: 'fallback-external', local: false }
] as const;

type ModelId = (typeof models)[number]['id'];

const usageStore = new Map<string, { requests: number; tokens_in: number; tokens_out: number }>();

const routeSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  task_type: z.enum(['biomedical', 'general_summary', 'slides_generation', 'microtask']),
  prompt: z.string().min(3),
  policy_id: z.string().optional(),
  allow_external_llm: z.boolean().default(false)
});

function selectModel(taskType: z.infer<typeof routeSchema>['task_type'], allowExternal: boolean): { model: ModelId; external: boolean } {
  if (taskType === 'biomedical') return { model: 'medgemma', external: false };
  if (taskType === 'microtask') return { model: 'llama-3.2-1b-instruct', external: false };
  if (allowExternal) return { model: 'openai-adapter', external: true };
  return { model: 'llama-3.2-3b-instruct', external: false };
}

app.get('/health', async () => ({ status: 'ok', service: 'llm-gateway' }));

app.get('/llm-gateway/models', async () => ({ models }));

app.post('/llm-gateway/route', async (req, reply) => {
  const parsed = routeSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const selected = selectModel(parsed.data.task_type, parsed.data.allow_external_llm);
  const tokensIn = Math.max(8, Math.round(parsed.data.prompt.length / 4));
  const tokensOut = Math.max(16, Math.round(tokensIn * 1.5));
  const usage = usageStore.get(parsed.data.workspace_id) ?? { requests: 0, tokens_in: 0, tokens_out: 0 };
  usage.requests += 1;
  usage.tokens_in += tokensIn;
  usage.tokens_out += tokensOut;
  usageStore.set(parsed.data.workspace_id, usage);

  return {
    request_id: randomUUID(),
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
    return { workspace_id: query.workspace_id, usage: usageStore.get(query.workspace_id) ?? { requests: 0, tokens_in: 0, tokens_out: 0 } };
  }
  return { usage: Object.fromEntries(usageStore.entries()) };
});

const port = Number(process.env.PORT ?? 3011);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
