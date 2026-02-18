import Fastify from 'fastify';
import { createHash, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

type Receipt = {
  receipt_id: string;
  content_id: string;
  type: string;
  created_at: string;
  pipeline_version: string;
  policy_id: string;
  inputs_hash: string;
  output_hash: string;
  disclosure: string;
  signature: string;
};

type DeletionReceipt = {
  report_id: string;
  workspace_id: string;
  user_id: string;
  deleted_refs: string[];
  created_at: string;
  signature: string;
};

type Db = { receipts: Receipt[]; deletion_receipts: DeletionReceipt[] };

const dbPath = resolve(process.cwd(), 'services/provenance/.data/receipts.json');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const envSchema = z.object({ PORT: z.coerce.number().default(3000), SERVICE_NAME: z.string() });
const issueSchema = z.object({
  content_id: z.string().min(3),
  type: z.string().min(2),
  pipeline_version: z.string().default('v1'),
  policy_id: z.string().default('default'),
  inputs_refs: z.array(z.string()).default([]),
  outputs_refs: z.array(z.string()).default([]),
  disclosure: z.string().default('conteúdo sintético / avatar virtual')
});
const deletionSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  deleted_refs: z.array(z.string()).min(1)
});

const env = envSchema.parse({ PORT: process.env.PORT, SERVICE_NAME: process.env.SERVICE_NAME ?? 'provenance' });
const app = Fastify({ logger: { level: 'info' } });

function loadDb(): Db {
  try { return JSON.parse(readFileSync(dbPath, 'utf8')) as Db; } catch { return { receipts: [], deletion_receipts: [] }; }
}
function saveDb(db: Db): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
function hashRefs(values: string[]): string {
  return createHash('sha256').update(values.sort().join('|')).digest('hex');
}

app.get('/health', async () => ({ status: 'ok', service: env.SERVICE_NAME }));
app.get('/v1/events/outbox', async () => ({ event: 'provenance.initialized', message: 'Outbox event contract placeholder for NATS publication.' }));

app.post('/provenance/issue', async (req, reply) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const payload = parsed.data;

  const receiptCore = {
    receipt_id: randomUUID(),
    content_id: payload.content_id,
    type: payload.type,
    created_at: new Date().toISOString(),
    pipeline_version: payload.pipeline_version,
    policy_id: payload.policy_id,
    inputs_hash: hashRefs(payload.inputs_refs),
    output_hash: hashRefs(payload.outputs_refs),
    disclosure: payload.disclosure
  };
  const signature = sign(null, Buffer.from(JSON.stringify(receiptCore)), privateKey).toString('base64');
  const receipt: Receipt = { ...receiptCore, signature };

  const db = loadDb();
  db.receipts.push(receipt);
  saveDb(db);

  return { receipt, public_key_pem: publicKey.export({ format: 'pem', type: 'spki' }).toString() };
});

app.get('/verify/:content_id', async (req, reply) => {
  const { content_id } = req.params as { content_id: string };
  const db = loadDb();
  const receipt = db.receipts.find((r) => r.content_id === content_id);
  if (!receipt) return reply.code(404).send({ error: 'receipt_not_found' });

  const { signature, ...core } = receipt;
  const valid = verify(null, Buffer.from(JSON.stringify(core)), publicKey, Buffer.from(signature, 'base64'));
  return {
    content_id: receipt.content_id,
    type: receipt.type,
    created_at: receipt.created_at,
    signature_valid: valid,
    disclosure: receipt.disclosure
  };
});

app.post('/provenance/deletion-receipt', async (req, reply) => {
  const parsed = deletionSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const payload = { report_id: randomUUID(), created_at: new Date().toISOString(), ...parsed.data };
  const signature = sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString('base64');
  const record: DeletionReceipt = { ...payload, signature };
  const db = loadDb();
  db.deletion_receipts.push(record);
  saveDb(db);
  return { deletion_receipt: record };
});

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health' || req.url.startsWith('/verify/')) return;
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
