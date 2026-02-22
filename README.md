# Databiomics Studio

Monorepo API-first do **Databiomics Studio** para MVP SaaS com arquitetura de microserviços. Este README foi escrito como guia operacional completo para:
- baixar o código;
- preparar ambiente local (Node/Python/Conda/infra);
- executar e testar;
- entender workflow ponta-a-ponta;
- avaliar escalabilidade;
- identificar o que ainda falta para produção enterprise.

> Idioma padrão: PT-BR (roadmap EN/ES).

---

## 1) Visão de arquitetura

### 1.1 Organização do monorepo
```text
/
  apps/                  # clientes (web + mobile)
  services/              # microserviços Node/Fastify/Prisma
  workers/               # workers Python e utilitários
  packages/              # SDKs e pacotes compartilhados
  infra/                 # docker compose e observabilidade
  docs/                  # documentação técnica
```

### 1.2 Serviços implementados
No diretório `services/`, o repositório contém os serviços:
- Core: `gateway`, `auth`, `workspace`, `billing`, `consent`, `policy`, `profile`, `upload`
- Media/Presentation: `avatar-builder`, `voice`, `deck`, `render`
- Meetings & Knowledge: `meetings`, `avatar-bot`, `transcription`, `notes-knowledge`, `execution`
- Trust & Growth: `provenance`, `growth`, `marketplace`, `notification`
- Admin & Integrations: `admin`, `integrations`
- AI/Research: `research`, `llm-gateway`, `rag`

Cada serviço segue padrão: `src/`, `prisma/`, `migrations/`, `openapi.yaml`, `tests/`.

### 1.3 Infraestrutura local (Docker Compose)
`infra/docker-compose.yml` sobe:
- Postgres
- Redis
- NATS
- MinIO
- LiveKit
- OTel Collector

---

## 2) Download do código

### 2.1 Clonar o repositório
```bash
git clone <URL_DO_REPOSITORIO>
cd Databiomics-Studio
```

### 2.2 Alternativa via fork
1. Faça fork no GitHub.
2. Clone seu fork:
```bash
git clone <URL_DO_SEU_FORK>
cd Databiomics-Studio
```
3. Configure upstream:
```bash
git remote add upstream <URL_ORIGINAL>
```

---

## 3) Requisitos de máquina (desenvolvimento)

## 3.1 Mínimo recomendado (DEV MODE)
- CPU: 6 vCPU
- RAM: 16 GB
- Disco: 30+ GB livres (dependências, imagens Docker, caches)
- SO: Linux/macOS/WSL2

## 3.2 Recomendado para fluxo confortável
- CPU: 8–12 vCPU
- RAM: 32 GB
- Disco SSD: 80+ GB livres

## 3.3 Para caminho de produção com IA local/renderer real
- GPU NVIDIA (VRAM alta, conforme modelo/pipeline)
- Nodes separados para inferência, render e transcrição
- Storage persistente para artefatos + logs + receipts

---

## 4) Pré-requisitos de software (com links oficiais)

Instale antes de rodar:
- Docker / Docker Compose: https://docs.docker.com/get-docker/
- Node.js LTS: https://nodejs.org/
- pnpm: https://pnpm.io/installation
- Python 3.11: https://www.python.org/downloads/
- Miniconda: https://docs.conda.io/en/latest/miniconda.html
- FFmpeg: https://ffmpeg.org/download.html
- LiveKit (conceito/servidor): https://docs.livekit.io/
- MinIO: https://min.io/docs/minio/container/index.html
- PostgreSQL: https://www.postgresql.org/download/
- Redis: https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/
- NATS: https://docs.nats.io/

---

## 5) Setup de ambiente local

### 5.1 Ambiente Conda (obrigatório para workers Python)
```bash
conda create -n databiomics-studio python=3.11 -y
conda activate databiomics-studio
pip install -r requirements.txt
```

### 5.2 Variáveis de ambiente
Crie arquivos `.env` por serviço conforme necessidade. Exemplo típico (research/llm):
- `PORT`
- `SERVICE_NAME`
- `LLM_BASE_URL` (opcional)
- `LLM_API_KEY` (opcional)

### 5.3 DEV MODE (recomendado no ambiente local)
Flags principais:
- `MOCK_MEDIA_PIPELINE=true`
- `RESEARCH_DEMO_FIXTURES=true` (opcional)
- `LLM_LOCAL_ONLY=true`

Com isso, o fluxo roda sem depender de stack pesada de produção (Unreal/MRQ/ASR real).

---

## 6) Como executar o projeto

### 6.1 Subir infraestrutura base
```bash
make dev
```

### 6.2 Rodar validações
```bash
make lint
make test
```

### 6.3 Rodar serviço específico
Exemplo com `research`:
```bash
cd services/research
pnpm install
pnpm dev
```

### 6.4 Rodar aplicação web/mobile (scaffold atual)
- Web: `apps/frontend-web/`
- Flutter: `apps/mobile-app-flutter/`

> Observação: os apps cliente estão em nível scaffold técnico (não UX final de produção).

---

## 7) Métodos usados no backend

- **API-first** com contratos `openapi.yaml` por serviço.
- **Fastify + logger JSON** para APIs.
- **Validação de payload** com `zod`.
- **Prisma** para modelagem e persistência.
- **Outbox/event contracts** para integração assíncrona (NATS).
- **RAG em serviço dedicado** e gateway de LLM separado.
- **Persistência local de sessões/dados mock** em `.data/` em serviços MVP.

---

## 8) Workflow funcional (fim a fim)

## 8.1 Fluxo de pesquisa e referências
1. Criar sessão em `research`.
2. Buscar papers por provider.
3. Anexar itens à sessão.
4. Resolver full-text com regra de compliance OA/licença.
5. Gerar insights/QA com contexto (RAG de sessão).
6. Exportar referências (BibTeX/CSL-JSON/RIS) para uso no deck.

### 8.2 Compliance de PDF/full-text
O sistema só permite `pdf_url_if_allowed` quando:
- item é OA com licença adequada;
- ou provider legal permite (ex.: fluxo Europe PMC quando disponível);
- ou PDF veio de upload do usuário.

Caso contrário, retorna `status=restricted` + `reason_not_available`.

## 8.3 Fluxo deck + export
- Deck recebe referências da sessão de pesquisa.
- Export retorna artefato e sinaliza preservação de links (`hyperlinks_preserved: true`).

## 8.4 Fluxo de meeting para execução
- Meeting/transcrição -> notes -> execution (JSON/CSV), com serviços dedicados.

---

## 9) Research + LLM + RAG (status atual)

### 9.1 Providers e adapters
`research` implementa adapter plugin com interface única por provider:
- `search(q, filters)`
- `get_item(id)`
- `resolve_fulltext(item)`
- `normalize(raw)`
- `rate_limit_policy()`

Registry versionado e endpoint para inspeção operacional.

### 9.2 Integração LLM
- Com `LLM_BASE_URL`, usa provider remoto compatível.
- Sem `LLM_BASE_URL`, mantém fallback local extractivo para continuidade no desenvolvimento.

### 9.3 RAG no ecossistema
- `rag-service` e `llm-gateway-service` existem no monorepo para separar responsabilidades.
- `research` já opera sessão com contexto e citações de referência (`provider:id`).

---

## 10) Escalabilidade (como evoluir)

### 10.1 Estratégia horizontal
- Escalar serviços stateless (`gateway`, `research`, `llm-gateway`, `rag`) por réplica.
- Manter estado em Postgres/Redis/object storage.

### 10.2 Mensageria/eventos
- Expandir publicação/consumo em NATS para jobs de ingestão, render e inferência.
- Aplicar DLQ + retry com backoff para resiliência.

### 10.3 Dados e observabilidade
- OTel ponta-a-ponta (traces/metrics/logs).
- Índices de banco por workload (sessões, jobs, usage).
- Retenção e auditoria por política/workspace.

### 10.4 IA e mídia
- Separar workers GPU para:
  - inferência LLM/embeddings;
  - render/avatar pipeline real;
  - ASR real.

---

## 11) O que já está finalizado vs. o que falta para produção

## 11.1 Já finalizado neste repositório (MVP técnico)
- Estrutura de microserviços com health/checks e contratos por serviço.
- Upload resumível TUS com sessão e validação SHA-256.
- Pesquisa com sessão, adapters e compliance de full-text/PDF.
- Export de referências para BibTeX/CSL-JSON/RIS.
- Blocos de provenance/share/referral, notes/execution, integrações MVP.

### 11.2 Ainda falta para produção enterprise
- Frontend web/mobile completo com UX premium final.
- Pipeline real de render/avatar (Unreal MRQ/MetaHuman/A2F) fora de mock.
- ASR/transcrição de produção com robustez e custo observável.
- Quotas completas por plano e billing enforcement hard.
- SSO/SCIM e integrações enterprise (Zoom/Meet/Teams/Jira/Notion etc.).
- Hardening SRE completo: circuit breaker global, backpressure, DLQ auditada, runbooks.
- Segurança/privacidade avançada (PII redaction externa por policy, controles finos de compartilhamento).

---

## 12) Guia rápido de operação

### 12.1 Comandos padrão
```bash
make dev
make lint
make test
```

### 12.2 Documentação complementar
- Arquitetura: `docs/architecture.md`
- Integração de modelos: `docs/model-integration.md`
- Upload resumível: `docs/upload-resumable.md`
- Checklist backend parte 1: `docs/parte1-backend-checklist.md`

---

## 13) Troubleshooting

- **`pnpm` não baixa via corepack**: verifique proxy/rede corporativa e configure mirror/local cache.
- **Portas já em uso**: ajuste `PORT` por serviço e reinicie compose.
- **Falha em dependências Docker**: execute `docker compose down -v` e suba novamente.
- **LLM remoto indisponível**: remova `LLM_BASE_URL` para fallback local extractivo no `research`.
- **Problemas com artefatos mock**: limpar diretórios `.data/` dos serviços afetados e reexecutar fluxo.

---

## 14) Licenciamento e compliance

- O repositório aplica regra de compliance para PDF/full-text em `research`.
- Não assuma download automático de artigos fechados.
- Para conteúdo não OA, use metadados/links externos ou upload explícito do usuário.


---


## 15) Gap detalhado para produção (solicitado)

Para acompanhamento executivo/técnico dos itens que ainda faltam para produção (frontend premium, pipeline real de avatar, ASR robusto, quotas hard, SSO/SCIM, hardening SRE e segurança avançada), consulte:

- `docs/production-readiness-gap.md`

Resumo objetivo do status atual:
- Frontend web/mobile premium: **não finalizado** (há scaffold técnico).
- Render/avatar real Unreal MRQ/MetaHuman/A2F: **não finalizado** (DEV mode/mock predominante).
- ASR/transcrição produção com custo observável: **não finalizado**.
- Quotas completas e billing enforcement hard: **parcial**.
- SSO/SCIM + integrações enterprise: **não finalizado**.
- Hardening SRE completo (circuit breaker/backpressure/DLQ/runbooks): **parcial**.
- Segurança/privacidade avançada (PII redaction por policy, sharing fino): **parcial**.

