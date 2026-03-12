---
name: repo-maintainer
description: Use when the task is about maintaining this repository as a Codex-friendly product repo, including AGENTS instructions, scripts, env files, README workflow docs, build/test/verify commands, and other automation hygiene.
---

# Repo Maintainer

Use this skill when the request is about repository automation, onboarding, command standardization, or keeping Codex maintenance workflows healthy.

## Workflow

1. Inspect the current source of truth first:
   - `README.md`
   - `AGENTS.md`
   - `Makefile`
   - `scripts/`
   - `docker-compose.yml`
   - subsystem `package.json` files
2. Prefer the repo-standard commands:
   - `make run`
   - `make test`
   - `make build`
   - `make verify`
3. If you change commands or env vars, update all of these together when relevant:
   - `README.md`
   - `.env.example`
   - `Makefile`
   - the affected scripts
   - `AGENTS.md`
4. Keep automation cross-platform enough for local macOS/Linux development and Docker Compose usage.
5. Favor small shell wrappers over introducing a new root toolchain unless it is clearly necessary.

## Repo-Specific Notes

- The repo has no root Node package. The standard automation surface is `Makefile` plus `scripts/`.
- `scripts/up.sh` is the preferred startup entry because it can use Docker Compose or fall back to local dev.
- `make verify` should remain the handoff gate for Codex work.
- Keep changes reviewable. Do not replace the current frontend/backend/python split.
