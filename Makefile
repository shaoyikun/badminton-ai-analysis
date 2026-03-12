SHELL := /bin/bash

.PHONY: setup run dev up up-build down logs compose-up compose-logs compose-logs-backend compose-logs-frontend compose-down compose-ps test build verify lint

setup:
	./scripts/setup-dev.sh

run:
	./scripts/up.sh

dev:
	./scripts/start-dev.sh

up:
	./scripts/up.sh

up-build:
	./scripts/up.sh --build

down:
	./scripts/down.sh

logs:
	./scripts/logs.sh

compose-up:
	docker compose up --build

compose-logs:
	docker compose logs -f

compose-logs-backend:
	docker compose logs -f backend

compose-logs-frontend:
	docker compose logs -f frontend

compose-down:
	docker compose down

compose-ps:
	docker compose ps

build:
	./scripts/build.sh

test:
	./scripts/test.sh

verify:
	./scripts/verify.sh

lint:
	cd frontend && npm run lint
