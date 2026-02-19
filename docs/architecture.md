# Databiomics Studio - Sprint 1 Architecture

## Core pillars
1. LGPD-first consent + provenance.
2. Meeting -> transcription -> notes -> execution.
3. Deck + Research Assist with references export.
4. API-first multi-client (web + flutter).

## Event backbone
NATS topics standardizados: `billing.subscription.*`, `research.query.executed`, `render.*`, `provenance.issued`, `usage.metered`.

## SRE baseline
- health checks por serviço (`/health`)
- logs JSON (Fastify)
- outbox table para publicação confiável
- rotas autenticadas com bearer token (exceto health)
