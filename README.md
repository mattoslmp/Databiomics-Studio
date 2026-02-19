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

Serviços core + mídia + meetings + knowledge + admin + novos serviços de IA:
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

Subir infraestrutura:

```bash
make dev
```

Executar testes:

```bash
make test
```

Validar contratos OpenAPI:

```bash
make lint
```

Executar um serviço específico (exemplo):

```bash
cd services/research
pnpm install
pnpm dev
```

## 5) DEV MODE

Flags principais:

- `MOCK_MEDIA_PIPELINE=true`
- `RESEARCH_DEMO_FIXTURES=true` (opcional)
- `LLM_LOCAL_ONLY=true` (default em dev)

Comportamento DEV MODE:

- clone-builder opera com mock mantendo pipeline/estado/receipts
- render gera placeholder MP4 com watermark
- transcription pode produzir transcript sample
- research pode operar com fixtures offline

## 6) SDKs (OpenAPI como fonte de verdade)

- SDK TS: `packages/sdk-ts/`
- SDK Dart: `packages/sdk-dart/`

Fluxo recomendado:
1. atualizar `openapi.yaml` nos serviços
2. rodar geração de SDKs no pipeline de CI
3. consumir SDK obrigatório em Web e Mobile

## 7) Research Assist + regra OA/PDF/full-text

Providers MVP implementados no serviço de research:
- fixture (offline)
- crossref
- arxiv

Regra de compliance:
- **somente baixar/armazenar PDF/full-text** quando houver permissão (OA/licença/PMC/EuropePMC) ou upload do usuário.
- caso contrário, manter metadados + link externo e preencher `reason_not_available`.

## 8) RAG (grounded)

Serviço `rag`:
- `POST /rag/ingest` → ingere documento e cria chunks citáveis
- `POST /rag/retrieve` → retrieval top-k com citações por chunk
- fallback sem contexto retorna: “não encontrei no material fornecido”.

## 9) LLM Gateway

Serviço `llm-gateway`:
- roteamento por tarefa para modelos locais:
  - `llama-3.2-1b-instruct` (microtasks)
  - `llama-3.2-3b-instruct` (sumarização/slides)
  - `medgemma` (biomédico, com aviso na UI)
- adapters externos preparados (`openai`, `deepseek`) sob policy `allow_external_llm`
- endpoint de uso por workspace (`/llm-gateway/usage`)

## 10) LLM local e alternância para OpenAI/DeepSeek

Modo local (recomendado em dev):
- manter `LLM_LOCAL_ONLY=true`

Modo externo controlado por policy:
- habilitar policy de workspace `allow_external_llm=true`
- usar adapter OpenAI/DeepSeek via LLM Gateway
- registrar auditoria de modelo/tokens/custo/latência

## 11) Upload resumível (TUS)

Serviço `upload`:
- `POST /uploads/tus`
- `HEAD /uploads/tus/:id`
- `PATCH /uploads/tus/:id`
- `POST /uploads/tus/:id/complete`
- `GET /uploads/sessions/:id`

## 12) Troubleshooting

- **Porta ocupada**: ajuste `PORT` do serviço e reinicie.
- **Banco indisponível**: valide containers com `docker ps` e logs do compose.
- **Falha de provider externo**: usar provider fixture e `RESEARCH_DEMO_FIXTURES=true`.
- **Sem contexto no RAG**: ingerir documentos antes de consultar (`/rag/ingest`).
- **LLM externo bloqueado**: revisar policy `allow_external_llm` e segredos.

## 13) Comandos úteis

```bash
make dev
make test
make lint
```
