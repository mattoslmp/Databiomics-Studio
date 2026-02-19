# Databiomics Studio

Plataforma **Databiomics Studio** (API-first, microserviços) para transformar conhecimento em entregáveis: pesquisa, reuniões e documentos viram slides, notas, execução e vídeo.

> Idioma padrão: **PT-BR** (roadmap EN/ES).

## 1) Arquitetura

Monorepo:

- `apps/` → clientes (`frontend-web`, `mobile-app-flutter`)
- `services/` → microserviços Fastify + OpenAPI + Prisma
- `workers/` → pipelines Python (ASR/media/RAG)
- `packages/` → SDKs (`sdk-ts`, `sdk-dart`) e compartilhados
- `infra/` → docker-compose e observabilidade
- `docs/` → documentação arquitetural/operacional

Serviços core + mídia + meetings + knowledge + admin + IA:
- `gateway`, `auth`, `workspace`, `billing`, `consent`, `policy`, `profile`, `upload`
- `avatar-builder`, `voice`, `deck`, `render`
- `meetings`, `avatar-bot`, `transcription`
- `notes-knowledge`, `execution`, `provenance`
- `growth`, `marketplace`, `notification`, `admin`
- `research`, `llm-gateway`, `rag`

## 2) Pré-requisitos (links oficiais)

- Docker + Docker Compose: https://docs.docker.com/get-docker/
- Node.js LTS: https://nodejs.org/
- pnpm: https://pnpm.io/installation
- Python 3.11: https://www.python.org/downloads/
- Miniconda: https://docs.conda.io/en/latest/miniconda.html
- FFmpeg: https://ffmpeg.org/download.html
- LiveKit: https://docs.livekit.io/home/self-hosting/local/
- MinIO: https://min.io/docs/minio/container/index.html
- PostgreSQL: https://www.postgresql.org/download/
- Redis: https://redis.io/docs/getting-started/
- NATS: https://docs.nats.io/running-a-nats-service/introduction/installation

## 3) Ambiente Python (Conda)

```bash
conda create -n databiomics-studio python=3.11
conda activate databiomics-studio
pip install -r requirements.txt
```

## 4) Como rodar local

```bash
make dev
make test
make lint
```

## 5) DEV MODE

Flags principais:
- `MOCK_MEDIA_PIPELINE=true`
- `RESEARCH_DEMO_FIXTURES=true` (opcional)
- `LLM_LOCAL_ONLY=true` (default em dev)

Comportamento DEV MODE:
- clone-builder em modo mock com estados e receipts
- render com placeholder MP4 + watermark
- transcription com transcript sample
- research com fixtures offline

## 6) SDKs (OpenAPI como fonte de verdade)

- SDK TS: `packages/sdk-ts/`
- SDK Dart: `packages/sdk-dart/`

Fluxo recomendado:
1. Atualizar `openapi.yaml` nos serviços
2. Gerar SDKs no CI
3. Consumir SDK obrigatório em Web e Mobile

## 7) Research Assist + regra OA/PDF/full-text

Providers MVP no serviço `research`: fixture, crossref, arxiv.

Regra de compliance:
- **somente baixar/armazenar PDF/full-text** quando houver permissão (OA/licença/PMC/EuropePMC) ou upload do usuário.
- caso contrário: metadados + link externo + `reason_not_available`.

## 8) RAG (grounded)

Serviço `rag`:
- `POST /rag/ingest`
- `POST /rag/retrieve`
- `GET /rag/outbox`
- `GET /metrics`

Regras implementadas:
- chunking com citações por origem (`source_ref` + índice)
- retrieval top-k com referências por chunk
- fallback sem evidência: “não encontrei no material fornecido”
- outbox com eventos `rag.document.ingested` e `rag.index.updated`

## 9) LLM Gateway

Serviço `llm-gateway`:
- `GET /llm-gateway/models`
- `POST /llm-gateway/route`
- `GET /llm-gateway/usage`
- `GET /llm-gateway/outbox`
- `GET /metrics`

Regras implementadas:
- roteamento por tarefa para `llama-3.2-1b-instruct`, `llama-3.2-3b-instruct`, `medgemma`
- fallback externo via policy (`allow_external_llm`)
- metering por workspace (`tokens_in`, `tokens_out`, `external_requests`)
- outbox com eventos `llm.request.completed` e `usage.metered`

## 10) Segurança e transparência (parte 1)

Controles já presentes no backend MVP:
- autenticação contextual por header de workspace nos serviços `llm-gateway` e `rag`
- logs estruturados via Fastify logger
- validação de entrada com `zod`
- healthcheck + métricas internas por serviço

## 11) Troubleshooting

- **Porta ocupada**: ajuste `PORT` do serviço.
- **Infra indisponível**: valide `docker ps` e logs do compose.
- **Sem contexto no RAG**: ingerir documentos antes do retrieval.
- **LLM externo bloqueado**: revisar policy `allow_external_llm` e segredos.
