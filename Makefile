SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup run dev up up-build down logs compose-up compose-logs compose-logs-backend compose-logs-frontend compose-down compose-ps test build verify verify-local lint evaluate

help:
	@printf "Repository commands for badminton-ai-analysis\n\n"
	@printf "  make setup         Install local dependencies for frontend, backend, and analysis-service.\n"
	@printf "  make run           Start the project, preferring Docker Compose and falling back to local dev.\n"
	@printf "  make dev           Start the local development path directly.\n"
	@printf "  make test          Run backend, frontend Playwright, and analysis-service automated tests.\n"
	@printf "  make build         Build backend/frontend and compile Python sources.\n"
	@printf "  make verify        Run the strict handoff gate, including Docker Compose builds.\n"
	@printf "  make verify-local  Run the local-only gate and skip Docker Compose build verification.\n"
	@printf "  make evaluate      Run the offline evaluation fixtures and compare against the checked-in baseline.\n"
	@printf "  make logs          Stream Docker Compose logs.\n"
	@printf "  make down          Stop Docker Compose services.\n"

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

verify-local:
	SKIP_DOCKER_VERIFY=1 ./scripts/verify.sh

evaluate:
	./scripts/evaluate.sh

lint:
	cd frontend && npm run lint
