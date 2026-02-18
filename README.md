# Databiomics Studio

Monorepo API-first do **Databiomics Studio** para MVP SaaS com microserviços desde o início, foco em:
- Avatar personalizado + vídeo
- Meeting → Transcript → Notes → Execution
- Verify/Share/Referral
- Pesquisa + LLM (RAG por sessão)
- Multi-cliente (Web + Flutter) consumindo o mesmo contrato OpenAPI

> Idioma padrão do produto: PT-BR (roadmap EN/ES).

---

## 1) Arquitetura atual do repositório

### Serviços (Node.js + Fastify + Prisma + OpenAPI)
`services/`
- `gateway`, `auth`, `workspace`, `billing`, `consent`, `policy`, `profile`
- `upload`, `avatar-builder`, `voice`, `deck`, `render`, `meetings`, `avatar-bot`
- `transcription`, `notes-knowledge`, `execution`, `provenance`, `growth`, `marketplace`
- `research`, `notification`, `admin`, `integrations`

Cada serviço possui:
- `src/`
- `prisma/` + `migrations/`
- `openapi.yaml`
- testes em `tests/`

### Clientes e SDKs
- Web scaffold: `apps/frontend-web/`
- Flutter scaffold: `apps/mobile-app-flutter/`
- SDK TS interno: `packages/sdk-ts/`
- SDK Dart interno: `packages/sdk-dart/`

### Infra local
`infra/docker-compose.yml` sobe:
- Postgres
- Redis
- NATS
- MinIO
- LiveKit
- OTel Collector

---

## 2) Pré-requisitos

- Docker + Docker Compose
- Node.js LTS
- pnpm
- Python 3.11
- (opcional) Flutter SDK para testar app mobile scaffold

---

## 3) Como rodar local

### 3.1 Subir infraestrutura
```bash
make dev
```

### 3.2 Rodar testes
```bash
make test
```

### 3.3 Validar contratos OpenAPI
```bash
make lint
```

### 3.4 Subir um serviço específico (exemplo)
```bash
cd services/research
pnpm install
pnpm dev
```

---

## 4) Upload resumível real (TUS) — implementado

Serviço: `services/upload`

Endpoints:
- `POST /uploads/tus` (criar sessão)
- `HEAD /uploads/tus/:id` (consultar offset)
- `PATCH /uploads/tus/:id` (enviar chunk)
- `POST /uploads/tus/:id/complete` (finalizar / validar SHA-256)
- `GET /uploads/sessions/:id` (status da sessão)

Persistência de sessão:
- `services/upload/.data/upload-sessions.json`

Campos principais:
- `workspace_id`, `user_id`, `upload_type`, `protocol`, `expected_size`, `received_size`, `sha256`, `status`, `metadata`

Mais detalhes:
- `docs/upload-resumable.md`

---

## 5) Contrato único Web + Flutter (OpenAPI/SDK)

### SDK TypeScript
- `packages/sdk-ts/src/upload-client.ts`

### SDK Dart
- `packages/sdk-dart/lib/upload_client.dart`

### Exemplo Web (resume/retry por chunks)
- `apps/frontend-web/src/upload-flow.ts`

### Exemplo Flutter (mesmo contrato)
- `apps/mobile-app-flutter/lib/upload_flow.dart`

---

## 6) Pesquisa + LLM com RAG por sessão — implementado

Serviço: `services/research`

### Providers
- `fixture` (offline)
- `crossref` (API pública)
- `arxiv` (API pública)

### Sessão de pesquisa
- `POST /research/sessions`
- `GET /research/sessions`
- `GET /research/sessions/:id`
- `POST /research/sessions/:id/attach`
- `POST /research/sessions/:id/generate-insights`

### RAG QA com modelo selecionado
- `POST /research/sessions/:id/qa`
  - usa `session.model_id` como modelo selecionado
  - recupera contexto dos itens anexados + fallback opcional ao provider da sessão
  - aplica retrieval top-k
  - responde com citações (`provider:id`)

### Integração com Deck
- `POST /deck/:deck_id/research/attach`
- `POST /deck/:deck_id/research/summarize`
- `GET /deck/:deck_id/references`
- `POST /deck/:deck_id/references/export`
- `POST /deck/:deck_id/references/render-slides`

### Configuração de LLM remoto
Variáveis:
- `LLM_BASE_URL`
- `LLM_API_KEY` (opcional)

Sem `LLM_BASE_URL`, o serviço usa fallback local extractivo para continuidade.

---

## 7) Verify / Share / Referral / Meeting→Execution

### Provenance
- `POST /provenance/issue`
- `GET /verify/:content_id`
- `POST /provenance/deletion-receipt`

### Growth
- `POST /growth/share-pages`
- `GET /share/:slug`
- `POST /growth/referrals/apply`
- `GET /growth/credits/:user_id`

### Notes
- `POST /notes/generate`
- `GET /notes/:meeting_id`

### Execution
- `POST /execution/generate`
- `GET /execution/:meeting_id`
- `GET /execution/:meeting_id/export?format=json|csv`

---

## 8) Integrations service (MVP entrada/saída)

Serviço: `services/integrations`
- `POST /integrations/import` (link/upload)
- `POST /integrations/export` (notes/tasks)
- `GET /integrations/jobs`

---

## 9) Testes executados no projeto

Comando padrão:
```bash
make test
```

Cobertura atual inclui:
- health tests por serviço
- testes de contrato (endpoints declarados)
- testes de store de upload

---

## 10) Limites atuais e próximos passos para 100% do plano

O repositório já implementa os blocos fundamentais (upload resumível, RAG por sessão, verify/share/referral, notes/execution, integrações MVP), porém ainda há etapas para completar todo o escopo empresarial completo:
- Web app Next.js completo de produto (atualmente scaffold técnico)
- Flutter app completo (atualmente scaffold + fluxo upload)
- billing quota enforcement no gateway em nível de produção
- pipeline de render real Unreal MRQ e ASR real em produção
- conectores externos (Notion/Jira/Trello/Zoom/Meet/Teams)
- CI de codegen OpenAPI→SDK automatizado end-to-end

---

## 11) Scripts

```bash
make dev
make test
make lint
```

---

## 12) Referências rápidas
- Arquitetura: `docs/architecture.md`
- Integração de modelos: `docs/model-integration.md`
- Upload resumível: `docs/upload-resumable.md`
