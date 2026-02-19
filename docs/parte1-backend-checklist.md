# Databiomics Studio — Parte 1 (Backend Foundation)

Checklist operacional para validar o baseline de serviços na fase 1.

## Itens exigidos por serviço

- [x] `GET /health`
- [x] Contrato OpenAPI (`openapi.yaml`)
- [x] Prisma schema + migration inicial
- [x] Logs JSON (Fastify logger)
- [x] Validação de entrada com `zod`
- [x] Teste de health
- [x] Teste de contrato

## Serviços adicionados/atualizados nesta entrega

### `services/llm-gateway`
- [x] Rotas de catálogo, roteamento e uso
- [x] Outbox (`/llm-gateway/outbox`) com eventos:
  - `llm.request.completed`
  - `usage.metered`
- [x] Métricas (`/metrics`)
- [x] Gate de contexto de workspace (`x-workspace-id`)

### `services/rag`
- [x] Ingestão e retrieval grounded com citações
- [x] Outbox (`/rag/outbox`) com eventos:
  - `rag.document.ingested`
  - `rag.index.updated`
- [x] Métricas (`/metrics`)
- [x] Gate de contexto de workspace (`x-workspace-id`)

## Compliance de evidência

- [x] Retrieval retorna citações rastreáveis por chunk
- [x] Sem contexto: resposta explícita de falta de evidência
- [x] Fluxo preparado para regra OA/full-text (enforced no `research`)
