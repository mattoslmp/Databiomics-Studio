# Databiomics Studio

Monorepo MVP API-first para Web + PWA + Mobile (Flutter) com microserviços Node.js/TypeScript e workers Python.

## Arquitetura
- `services/*`: 23 microserviços com Fastify, OpenAPI, Prisma, migration inicial de outbox e teste mínimo.
- `workers/*`: placeholders para media/asr/research em Python 3.11.
- `apps/frontend-web` e `apps/mobile-app-flutter`: scaffolds iniciais.
- `infra/docker-compose.yml`: Postgres, Redis, NATS e MinIO para desenvolvimento.

## Pré-requisitos
- Git, Docker/Compose, Node.js LTS + pnpm, Python 3.11, FFmpeg, Miniconda.
- Produção: Unreal Engine MRQ headless, NVIDIA Audio2Face, LiveKit, observabilidade OTel.

## Rodar local
```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @databiomics/research dev
```

## DEV MODE
Variáveis recomendadas:
- `MOCK_MEDIA_PIPELINE=true`
- `RESEARCH_DEMO_FIXTURES=true`

## Research Assist (MVP)
Serviço `research` expõe:
- `/research/providers`
- `/research/search`
- `/research/item/:provider/:id`
- `/research/resolve-fulltext`
- `/deck/:deck_id/research/attach`
- `/deck/:deck_id/research/summarize`
- `/deck/:deck_id/references`
- `/deck/:deck_id/references/export`
- `/deck/:deck_id/references/render-slides`

## Download de modelos (Admin: Llama 3.2 + MedGemma)
Sim: no MVP há **duas formas** de iniciar fluxo de download para Llama 3.2 e MedGemma.

### 1) Via interface/API de admin
- `GET /admin/models` lista catálogo e status.
- `POST /admin/models/download` aceita:
  - `model_id`: `llama-3.2-1b-instruct`, `llama-3.2-3b-instruct`, `google/medgemma-1.5-4b-it` ou `google/medgemma-4b-it`
  - `transport`: `ui` ou `python-client`

Exemplo:
```bash
curl -X POST http://localhost:3000/admin/models/download \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"model_id":"llama-3.2-3b-instruct","transport":"ui"}'
```

### 2) Via client Python (execução local)
Script:
```bash
python workers/research-worker-python/client/download_model.py --model llama-3.2-3b-instruct
python workers/research-worker-python/client/download_model.py --model llama-3.2-1b-instruct
python workers/research-worker-python/client/download_model.py --model google/medgemma-1.5-4b-it
python workers/research-worker-python/client/download_model.py --model google/medgemma-4b-it
```

O script imprime instruções usando `huggingface_hub.snapshot_download` e `huggingface-cli`.

## SDKs
OpenAPI por serviço em `services/*/openapi.yaml` para gerar SDK TS e Dart via CI.

## Testes
```bash
pnpm -r --if-present test
```
