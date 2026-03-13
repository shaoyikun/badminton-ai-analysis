## Project Overview

This repository is a badminton action-analysis PoC. The current product flow is:

1. Create an analysis task for `clear` or `smash`
2. Upload a short badminton video
3. Run preprocess with `ffprobe` and `ffmpeg`
4. Run pose estimation through the Python `analysis-service`
5. Generate a rule-based report, history view, and retest comparison

The codebase is still PoC-oriented. Prefer small, reviewable changes that preserve the current stack and directory layout.

## Stack And Entry Points

- `frontend/`: React 19 + Vite H5 PoC
- `backend/`: Fastify + TypeScript API and local file store
- `analysis-service/`: Python pose-analysis helper using OpenCV + MediaPipe
- `prototype/`: static interaction prototypes
- `docs/` and `spec/`: product, design, API, and implementation references

Primary runtime entry points:

- [frontend/src/App.tsx](/Users/bytedance/coding/badminton-ai-analysis/frontend/src/App.tsx)
- [backend/src/server.ts](/Users/bytedance/coding/badminton-ai-analysis/backend/src/server.ts)
- [analysis-service/app.py](/Users/bytedance/coding/badminton-ai-analysis/analysis-service/app.py)

## Standard Commands

Use these commands as the default automation interface for this repo:

- `make help`: discover the supported repo commands
- `make setup`: install local dependencies and bootstrap the repo
- `make run`: stable startup command, prefers Docker Compose and falls back to local dev
- `make test`: stable automated test command
- `make build`: stable production build command
- `make verify`: strict validation command for handoff
- `make verify-local`: local-only validation command that skips Docker Compose build verification

Supporting commands:

- `./scripts/setup-dev.sh`: install local dependencies
- `make dev`: force local development mode
- `make down`: stop Docker Compose services
- `make logs`: stream Docker Compose logs

## Repo-Local Skills

Use the repo-local skills under `.codex/skills/` when their scope matches the task.

Common umbrella skills to start with:

- `repo-maintainer`: repo automation, scripts, docs, AGENTS, onboarding, build/test/verify workflow changes
- `analysis-pipeline`: upload, preprocess, pose, scoring, report, and frontend result flow changes

Additional specialized skills also live alongside them under `.codex/skills/` for API contracts, analysis-flow state transitions, Python integration, H5 product UI, Playwright QA, docs/spec sync, evaluation/regression, delivery baseline, shared contracts/adapters, and skill evolution from new learnings or pitfalls.

Each skill folder uses `SKILL.md` as the source of truth and may include `examples/` for narrow implementation patterns.

## Working Agreements

- Start by reading the relevant README, AGENTS instructions, and the touched subsystem before editing.
- Prefer updating existing scripts and docs over adding parallel alternatives.
- When commands or env vars change, keep `README.md`, `.env.example`, `Makefile`, and relevant scripts in sync.
- Keep `docs/engineering/DELIVERY-BASELINE.md` aligned with the actual run/test/build/verify workflow.
- When API or workflow changes touch both backend and frontend, document the end-to-end effect in the final handoff.
- When a change, failure, workaround, or pitfall reveals reusable repo knowledge, review the current repo-local skills and decide whether to update an existing skill or create a new one under `.codex/skills/`.
- Avoid large refactors unless they are required to restore automation, testability, or build stability.

## Definition Of Done

A task is done when all applicable items below are true:

- Code changes are minimal, reviewable, and aligned with the current architecture
- `make test` passes
- `make build` passes
- `make verify` passes for the touched scope
- Docs and repo-local skills are updated when commands, workflow, architecture, or reusable lessons and pitfalls meaningfully change
- Residual risks, skipped checks, or known follow-up items are called out explicitly
