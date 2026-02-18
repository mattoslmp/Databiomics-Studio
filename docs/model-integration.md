# Integração de Modelos no App (Llama + MedGemma)

Este documento descreve o fluxo recomendado para integrar modelos no Databiomics Studio.

## 1) Cadastro e download (Admin)
1. A UI Admin chama `GET /admin/models` para listar catálogo, status e metadados.
2. Ao clicar em **Instalar**, a UI chama `POST /admin/models/download` com `model_id` e `transport`.
3. O Admin registra estado `downloading` e retorna `python_client_command` para execução no worker.

## 2) Materialização do modelo (Worker Python)
1. O operador/runner executa `workers/research-worker-python/client/download_model.py`.
2. O script gera instruções de `snapshot_download` / `huggingface-cli`.
3. Os pesos são baixados em `.models/<model_normalizado>`.

## 3) Registro de runtime (próximo passo recomendado)
Após baixar:
- registrar no serviço admin ou research um documento com:
  - `model_id`
  - `local_path`
  - `engine` (`vllm`, `transformers`, `tgi`)
  - `modality` (`text` vs `multimodal`)
  - `status=installed`

## 4) Serviço de inferência (app runtime)
O app não chama o modelo diretamente. O fluxo é:
- Web/Mobile -> API Gateway -> serviço de domínio (research/deck/notes)
- Serviço de domínio -> fila/job -> worker de inferência
- Worker usa `model_id` + runtime config para carregar/pinar o modelo.

### Regras por tipo
- Llama 3.2 (`Text-to-Text`): endpoints de geração textual (resumo, bullets, Q&A).
- MedGemma (`Image-Text-to-Text`): endpoints multimodais (imagem + prompt clínico/educacional).

## 5) Contrato de API sugerido para uso no app
- `POST /ai/generate-text`
  - body: `{ model_id, prompt, context_refs[] }`
- `POST /ai/generate-multimodal`
  - body: `{ model_id, prompt, image_refs[] }`
- `GET /ai/jobs/:job_id`
  - status/progresso/erros

## 6) Segurança e governança
- Restringir uso por plano/workspace (feature flag + quota).
- Audit log por inferência: `workspace_id`, `user_id`, `model_id`, `inputs_refs`, `created_at`.
- Não persistir imagem sensível sem policy de retenção e consentimento.
- Sempre retornar provenance/receipt quando output virar asset compartilhável.

## 7) UX no app (como aparece para usuário)
- Seletor de modelo por tarefa:
  - "Rápido/Texto" -> Llama 1B/3B
  - "Imagem + Texto" -> MedGemma 4B
- Indicador visual de disponibilidade (`available/downloading/installed`).
- Fallback automático para modelo `installed` padrão se o selecionado não estiver pronto.

## 8) Checklist de implementação incremental
1. Persistir `ModelInstallation` no banco do admin/research.
2. Criar worker de inferência com fila dedicada.
3. Expor endpoints `ai/*` no gateway.
4. Integrar UI (selector + job status + fallback).
5. Medir custo/latência por modelo.


## 9) Contexto correto no Databiomics Studio (Avatar vs Modelos de IA)
Se o objetivo principal do app é **criar avatar**, o contexto é este:

- **Criação de avatar (core de mídia)**:
  - Usa `avatar-builder`, `voice`, `render` (Unreal/A2F, lip-sync, MP4 etc.).
  - Não depende de Llama/MedGemma para gerar o rosto/rig/animação.
- **Modelos Llama/MedGemma (camada de inteligência)**:
  - Entram para tarefas de texto e multimodal no produto:
    - Research Assist no editor de slides;
    - sumarização de reuniões/transcrições;
    - geração de bullets/outline/referências;
    - Q&A sobre base de conhecimento.

### Em qual contexto isso “funciona” no app
1. Usuário cria avatar normalmente no pipeline de mídia.
2. Em paralelo, usa IA para preparar roteiro, análise de conteúdo e apoio à apresentação.
3. O resultado final combina:
   - **Avatar renderizado** (pipeline de mídia) +
   - **Conteúdo inteligente** (pipeline LLM/MLLM).

Resumo: os modelos **complementam** o app de avatar; não substituem a criação/renderização do avatar.


## 10) Implementação real da sessão Pesquisa + LLM
Endpoints implementados no `research-service`:
- `POST /research/sessions`
- `GET /research/sessions`
- `GET /research/sessions/:id`
- `POST /research/sessions/:id/attach`
- `POST /research/sessions/:id/generate-insights`

Comportamento técnico:
- Persistência em arquivo (`services/research/.data/sessions.json`) para manter sessão entre chamadas.
- Providers reais:
  - `crossref` (API pública)
  - `arxiv` (export API)
  - `fixture` (offline local)
- Geração:
  - remoto via `LLM_BASE_URL` + `LLM_API_KEY` (OpenAI-compatible)
  - fallback local extractivo com citações por `provider:id`.

Assim, o app de pesquisa + LLM já possui sessão dedicada com estado, anexos e geração reutilizável no deck.
