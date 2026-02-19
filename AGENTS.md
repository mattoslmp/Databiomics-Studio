# AGENTS.md

## Comandos padrão
- `make dev`: sobe infraestrutura local (`infra/docker-compose.yml`).
- `make test`: executa testes Node dos serviços.
- `make lint`: valida presença de contratos OpenAPI por serviço.

## Convenções de pastas
- `services/<service>/src`: código do serviço.
- `services/<service>/prisma` + `migrations`: modelo e migrações.
- `services/<service>/openapi.yaml`: contrato da API.
- `services/<service>/tests`: testes unitários/contrato.
- `workers/*`: workers Python e utilitários.
- `docs/*`: documentação arquitetural e operacional.

## Estilo de código
- TypeScript: manter formatação consistente (Prettier style, 2 espaços, aspas simples).
- Python: formatação consistente compatível com `black` e lint `ruff`.
- Logs estruturados em JSON (Fastify logger).
- Validação de entrada com `zod`.
