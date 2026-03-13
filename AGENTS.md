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

- `change-startup-context-review`: default pre-change startup review; inspect existing repo truth and establish a startup conclusion before most development changes
- `repo-maintainer`: repo automation, scripts, docs, AGENTS, onboarding, build/test/verify workflow changes
- `analysis-pipeline`: upload, preprocess, pose, scoring, report, and frontend result flow changes

Specialized skills to trigger directly when their scope matches:

- `analysis-service-integration`: backend preprocess, `ffprobe`/`ffmpeg`, Python analysis-service invocation, pose output parsing, recoverable failure mapping
- `backend-api-contracts`: Fastify route behavior, request/response shapes, task status payloads, history/comparison/report APIs, error response structure
- `badminton-analysis-flow`: upload-to-analysis flow, candidate clip coarse scan, segment selection, task state transitions, polling, retry behavior
- `badminton-h5-product-ui`: mobile H5 productization for home, guide, upload, processing, report, history, compare, and error pages
- `badminton-playwright-mobile-qa`: mobile-first Playwright coverage, mock API alignment, screenshots, and end-to-end H5 validation
- `badminton-vision-engineering`: segment detection, recommended clip selection, selected-segment sampling, pose/phase recognition, evidence gating, explainable scoring
- `docs-spec-sync`: keeping `docs/`, `spec/`, `README.md`, and subsystem READMEs aligned with implementation changes
- `evaluation-and-regression`: scoring thresholds, pose summaries, fixtures, baselines, drift review, and evaluation guardrails
- `mobile-ui-interaction-design`: UI interaction review, component selection, mobile UX polish, screenshot-driven review, and structured UI self-check
- `repo-delivery-baseline`: repository-level run/test/build/verify/evaluate expectations, Docker Compose behavior, and handoff gate changes
- `shared-contracts-and-adapters`: `shared/contracts.d.ts`, frontend adapters/view models, and backend-to-UI response mapping
- `skill-evolution`: updating existing skills or adding a new repo-local skill when a reusable workflow, pitfall, or trigger rule is discovered

Frontend-facing specialized skills to prefer when UI work is involved:

- `ui-ux-pro-max`: generate sports/mobile design inputs first for obvious visual refresh or productization work, then fold the chosen decisions into the repo's existing docs and frontend design-system sources
- `badminton-h5-product-ui`: page/productization baseline for the mobile H5 flow
- `mobile-ui-interaction-design`: proactive UI interaction review, component selection, screenshot-driven polish, and structured UI self-review
- `badminton-playwright-mobile-qa`: Playwright validation, mobile screenshots, and end-to-end UI verification

Each skill folder uses `SKILL.md` as the source of truth and may include `examples/` for narrow implementation patterns.

Treat the skill bullets above as direct trigger rules rather than a loose catalog. If a task clearly matches one of those scopes, use that skill explicitly instead of relying only on an umbrella skill; if multiple skills match, use the minimal set that covers the task and start with `change-startup-context-review` for most development changes.

## Working Agreements

- Start by reading the relevant README, AGENTS instructions, and the touched subsystem before editing.
- For most development changes, start with `change-startup-context-review` to inspect existing truth sources and form a brief startup conclusion before choosing a more specific skill.
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
