# Production Readiness Gap Analysis (Databiomics Studio)

Este documento lista os gaps de produção solicitados e o plano objetivo para fechamento.

## 1) Frontend web/mobile completo com UX premium final
**Status atual:** parcial (scaffold técnico).

### Faltante
- Design system consolidado (tokens, componentes, estados de loading/erro/empty).
- Fluxos completos de onboarding, auth, billing, AI Assist, deck editor e exports.
- Gestão de estado robusta e telemetria de UX.
- E2E com Playwright (web) e integração Flutter.

### Critério de pronto
- Cobertura E2E dos fluxos críticos.
- Zero telas placeholder.
- NPS interno de UX aprovado e checklist de acessibilidade AA.

## 2) Pipeline real render/avatar (Unreal MRQ/MetaHuman/A2F)
**Status atual:** mock/dev mode.

### Faltante
- Workers GPU dedicados para render.
- Pipeline de ingestão de assets, sincronização labial e geração final MP4 sem mocks.
- Gate de similaridade/qualidade e validações de segurança de mídia.

### Critério de pronto
- Render real em produção com SLA e fallback.
- Métricas por etapa (fila, render time, falha, retry).

## 3) ASR/transcrição de produção (robustez + custo observável)
**Status atual:** básico/mode sample.

### Faltante
- Motor ASR de produção (ex.: faster-whisper em workers dedicados) com filas.
- Métricas de WER aproximada, latência por minuto e custo por job.
- Retries, idempotência, DLQ e reprocessamento auditável.

### Critério de pronto
- Pipeline estável com telemetria completa e limites por plano.

## 4) Quotas completas por plano + billing enforcement hard
**Status atual:** parcial.

### Faltante
- Enforcement transacional no gateway e nos serviços consumidores.
- Medição por recurso (research_queries, llm_tokens, rag_ingestion, exports etc.).
- Bloqueio explícito por policy/plan com erro padronizado.

### Critério de pronto
- Nenhuma operação premium executa sem validação de quota/plano.

## 5) SSO/SCIM e integrações enterprise
**Status atual:** não concluído.

### Faltante
- SSO (OIDC/SAML), provisionamento SCIM e RBAC enterprise.
- Conectores corporativos (Zoom/Meet/Teams/Jira/Notion, etc.).
- Auditoria de acesso e trilha de provisionamento.

### Critério de pronto
- Fluxo de provisionamento/desprovisionamento automático + logs auditáveis.

## 6) Hardening SRE completo
**Status atual:** parcial.

### Faltante
- Circuit breakers globais e políticas de timeout/backpressure.
- DLQ por domínio com playbooks de reprocessamento.
- Runbooks operacionais, SLO/SLI e testes de caos básicos.

### Critério de pronto
- Operação com SLO definido, alertas e resposta padronizada.

## 7) Segurança/privacidade avançada
**Status atual:** parcial.

### Faltante
- Redação de PII para LLM externo por policy explícita.
- Controles finos de compartilhamento (expiração, escopo, revogação).
- Revisão OWASP ASVS, hardening de secrets e criptografia em repouso/trânsito.

### Critério de pronto
- Compliance operacional com auditoria contínua e evidências de controle.

---

## Roadmap sugerido por ondas
1. **Wave 1 (Fundação produção):** quotas hard, SRE hardening, segurança base.
2. **Wave 2 (IA/mídia real):** render real + ASR produção + observabilidade de custo.
3. **Wave 3 (Produto enterprise):** frontend premium completo + SSO/SCIM + integrações enterprise.

