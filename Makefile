.PHONY: dev test lint

dev:
	docker compose -f infra/docker-compose.yml up -d

test:
	node --test services/*/tests/*.mjs

lint:
	rg -n "openapi: 3.1.0" services/*/openapi.yaml
