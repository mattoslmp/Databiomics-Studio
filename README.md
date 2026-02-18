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


## Como os modelos serão integrados no app
Resumo rápido:
- Admin instala/gerencia catálogo via `GET /admin/models` e `POST /admin/models/download`.
- Worker Python materializa os pesos no ambiente de execução.
- Serviços do app chamam um worker de inferência por `job` (não chamam o modelo direto no front).
- UI Web/Mobile escolhe modelo por tarefa e acompanha status.

Detalhamento completo em: `docs/model-integration.md`.



## Contexto de uso no app (importante)
- O produto continua sendo de **criação de avatar e vídeo** (pipeline `avatar-builder` + `voice` + `render`).
- Llama/MedGemma não renderizam avatar; eles apoiam inteligência de conteúdo (Research, Notes, Q&A, roteiro, resumo).
- Portanto, funcionam como camada complementar ao fluxo de avatar.


## Sessão específica Pesquisa + LLM (implementada)
Fluxo já implementado no `research-service`:
1. `POST /research/sessions` cria sessão com `workspace_id`, `user_id`, `topic`, `model_id`, `provider`.
2. `GET /research/search?provider=&q=` busca papers via adapter real (Crossref/arXiv) ou `fixture`.
3. `POST /research/sessions/:id/attach` anexa itens selecionados à sessão.
4. `POST /research/sessions/:id/generate-insights` gera bullets:
   - usa LLM remoto OpenAI-compatible se `LLM_BASE_URL` estiver configurado;
   - fallback robusto para engine local extractiva com referências.
5. `POST /deck/:deck_id/research/summarize` e `/references/export` usam a mesma sessão.

Isso cria um contexto contínuo de pesquisa + geração (sem estado perdido), pronto para consumo por Web/App.

## SDKs
OpenAPI por serviço em `services/*/openapi.yaml` para gerar SDK TS e Dart via CI.

## Testes
```bash
pnpm -r --if-present test
```


## Scripts de desenvolvimento
```bash
make dev
make test
make lint
```

## Verify + Share + Referral (implementado no MVP técnico)
- Provenance:
  - `POST /provenance/issue` emite receipt assinado (Ed25519)
  - `GET /verify/:content_id` valida assinatura sem expor PII
  - `POST /provenance/deletion-receipt` emite receipt de deleção
- Growth:
  - `POST /growth/share-pages` cria share page com disclosure
  - `GET /share/:slug` exibe dados públicos sem PII
  - `POST /growth/referrals/apply` aplica referral com anti-fraude básico (cooldown por IP hash)

## Meeting -> Notes -> Execution (implementado no MVP técnico)
- Notes & Knowledge:
  - `POST /notes/generate` gera summary + bullets + evidence chunks
  - `GET /notes/:meeting_id` recupera notas e evidências
- Execution:
  - `POST /execution/generate` gera tasks/decisions/risks/open_questions
  - `GET /execution/:meeting_id/export?format=json|csv`

## Upload resumível
- Requisito arquitetural já documentado para TUS/multipart com sessões (`upload_sessions`).
- Implementação resumível completa no gateway/upload-service está em fase seguinte do roadmap técnico.


## Upload resumível real (TUS) implementado
No `upload-service`:
- `POST /uploads/tus`
- `HEAD /uploads/tus/:id`
- `PATCH /uploads/tus/:id`
- `POST /uploads/tus/:id/complete`
- `GET /uploads/sessions/:id`

Detalhes: `docs/upload-resumable.md`.

## Web + Flutter usando o mesmo contrato
- SDK TS: `packages/sdk-ts/src/upload-client.ts`
- SDK Dart: `packages/sdk-dart/lib/upload_client.dart`
- Exemplo Web: `apps/frontend-web/src/upload-flow.ts`
- Exemplo Flutter: `apps/mobile-app-flutter/lib/upload_flow.dart`
