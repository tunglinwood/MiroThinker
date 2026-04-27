# MiroThinker — Agent Coding Guide

> This file is intended for AI coding agents. It assumes you know nothing about the project.

## Project Overview

MiroThinker is an open-source deep research agent framework built around LLMs and MCP (Model Context Protocol) tools. It implements interactive scaling — training agents to handle deep, frequent tool interactions — and achieves 88.2% on the BrowseComp benchmark. The repository is a monorepo containing the core agent runtime, a library of MCP tools, a Next.js web frontend, and supporting utilities for trace collection and visualization.

Key capabilities:
- Multi-turn agent execution with up to 300–600 tool calls per task (depending on config)
- 256K context window support
- Single-agent and multi-agent orchestration
- Extensive benchmark evaluation suite (GAIA, BrowseComp, HLE, Frames, WebWalkerQA, etc.)
- Fully local zero-API-key deployment option using SearXNG, Crawl4AI, and Microsandbox Docker

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | Python 3.12+ (backend), TypeScript (frontend) |
| Package Manager | uv (Python), npm (Node.js) |
| Build Backend | hatchling |
| Web Framework | FastAPI (REST API), Next.js 15 + React 19 (frontend) |
| Configuration | Hydra + OmegaConf (YAML-based composition) |
| Tool Protocol | MCP (Model Context Protocol) via stdio and SSE |
| Containerization | Docker, Docker Compose |
| Lint / Format | Ruff 0.8.0 |
| Markdown Format | mdformat 0.7.17 |
| License Compliance | reuse (Apache 2.0) |
| Testing | pytest, pytest-xdist, pytest-cov, pytest-html |

## Repository Structure

```
MiroThinker/
├── apps/
│   ├── miroflow-agent/          # Main agent framework + REST API
│   │   ├── src/                 # Pipeline, orchestrator, tool executor, LLM clients, I/O, logging, utils
│   │   ├── api/                 # FastAPI application (routes, models, middleware, dependencies)
│   │   ├── core/                # API task manager + executor (state + workers)
│   │   ├── conf/                # Hydra configs (agent/, llm/, benchmark/)
│   │   ├── benchmarks/          # Evaluation scripts + evaluators
│   │   ├── scripts/             # Shell scripts for multi-run benchmarks
│   │   ├── main.py              # CLI entry point (single task)
│   │   ├── api_server.py        # FastAPI entry point
│   │   ├── pyproject.toml       # uv + hatchling config
│   │   ├── uv.lock              # Locked dependency tree
│   │   ├── Dockerfile           # Multi-stage Docker build
│   │   ├── .env.example         # Environment variable template
│   │   └── settings.yaml        # SearXNG settings (mounted in Docker)
│   ├── mirothinker-web/         # Next.js frontend
│   │   ├── src/app/             # Pages (login, admin, home)
│   │   ├── src/components/      # React components
│   │   ├── src/lib/             # API client, SSE parser, types
│   │   ├── package.json         # npm dependencies
│   │   ├── next.config.ts       # Next.js standalone output config
│   │   └── Dockerfile           # Node 20 Alpine multi-stage build
│   ├── gradio-demo/             # Gradio demo UI
│   │   └── pyproject.toml
│   ├── collect-trace/           # Trace collection for SFT/DPO data
│   │   └── pyproject.toml
│   ├── visualize-trace/         # Flask dashboard for trace analysis
│   │   └── pyproject.toml
│   └── lobehub-compatibility/   # LobeHub tool parser compatibility layer
│       ├── MiroThinkerToolParser.py
│       ├── chat_template.jinja
│       └── test_tool_parser.py
├── libs/
│   └── miroflow-tools/          # MCP server library
│       ├── src/miroflow_tools/
│       │   ├── mcp_servers/     # Production MCP servers (search, scrape, vision, audio, reasoning, code, etc.)
│       │   ├── dev_mcp_servers/ # Dev / composite MCP servers
│       │   └── manager.py       # ToolManager (MCP client orchestrator)
│       └── pyproject.toml
├── docker-compose.yml           # Full stack: SearXNG + Crawl4AI + API + Web
├── justfile                     # Pre-commit automation (lint, sort-imports, format, format-md)
├── .github/workflows/run-ruff.yml
└── CLAUDE.md                    # Additional Claude Code guidance
```

## Build and Run Commands

### Backend (apps/miroflow-agent)

```bash
cd apps/miroflow-agent

# Install dependencies (uses uv.lock)
uv sync

# Run a single task (CLI)
uv run python main.py llm=qwen-3 agent=mirothinker_1.7_keep5_max200 llm.base_url=http://localhost:61002/v1

# Run with fully local zero-API-key setup
# Prerequisites: SearXNG on :8080, Crawl4AI on :11235, microsandbox/python Docker image
uv run python main.py llm=local-qwen35 agent=mirothinker_1.7_microsandbox

# Run benchmark evaluation
uv run python main.py llm=qwen-3 agent=mirothinker_1.7_keep5_max200 benchmark=gaia-validation-text-103

# Run REST API server
uv run uvicorn api_server:app --host 0.0.0.0 --port 8002

# Run tests (pytest is configured in pyproject.toml)
uv run pytest

# Run specific test file
uv run pytest path/to/test.py -v
```

### Frontend (apps/mirothinker-web)

```bash
cd apps/mirothinker-web
npm install
npm run dev      # Dev server on :3002
npm run build    # Production build (standalone output)
npm run start    # Start production server
npm run lint     # ESLint
```

### Supporting Apps

```bash
# Gradio demo
cd apps/gradio-demo && uv sync && uv run python app.py

# Trace dashboard
cd apps/visualize-trace && uv sync && uv run python app.py

# Collect traces
cd apps/collect-trace && uv sync && uv run python main.py
```

### Full Stack (Docker Compose)

```bash
# Start SearXNG + Crawl4AI + API + Web
docker-compose up -d

# Services:
# - SearXNG      → http://localhost:8080
# - Crawl4AI     → http://localhost:11235
# - API          → http://localhost:8002
# - Web          → http://localhost:3002
```

### Monorepo Quality Checks (justfile)

Run these from the repository root before submitting a PR:

```bash
just lint           # Ruff check --fix
just sort-imports   # Ruff import sorting
just format         # Ruff format
just format-md      # mdformat all .md files
just check-license  # reuse lint (verify license headers)
just precommit      # Run lint + sort-imports + format-md + format
```

## Code Organization

### Import Conventions

- **miroflow-agent**: The `src/` directory is an importable package. Use `from src.core.pipeline import ...` or `from src.llm.factory import ...`. The `__init__.py` in `src/` exposes `Orchestrator`, `create_pipeline_components`, `execute_task_pipeline`, `OutputFormatter`, `ClientFactory`, `TaskLog`, and `bootstrap_logger`.
- **miroflow-tools**: Imported as `miroflow_tools`. Use `from miroflow_tools.manager import ToolManager`.

### Agent Execution Flow

1. `main.py` (or `api_server.py`) loads Hydra config from `conf/`.
2. `src/core/pipeline.py` creates:
   - `ToolManager` instances (main + optional sub-agents)
   - `OutputFormatter`
3. `src/core/orchestrator.py` runs the main loop:
   - LLM call → parse response → extract tool calls
   - `ToolExecutor` executes tools via `ToolManager`
   - Context management (`keep_tool_result`) trims old observations
   - Rollback on duplicate queries, format errors, or refusal keywords
   - Sub-agent invocation if configured
4. `src/logging/task_logger.py` persists structured JSON logs to `logs/debug/`.

### REST API Architecture

- `api_server.py`: FastAPI app with lifespan handler, CORS, route inclusion.
- `api/dependencies.py`: Thread-safe singletons (`TaskManager`, `TaskExecutor`) using `threading.RLock`.
- `api/routes/tasks.py`: Task CRUD, async background execution, SSE streaming.
- `api/routes/auth.py`: JWT-based login and token refresh.
- `api/routes/admin.py`: Admin dashboard endpoints.
- `api/routes/uploads.py`: File upload handling.
- `api/routes/configs.py`: List available agent/LLM configurations.
- `api/routes/health.py`: Health check endpoint.
- `api/middleware/auth.py`: JWT auth middleware.
- Task lifecycle: `pending → running → completed | failed | cancelled`.

### LLM Layer

- `src/llm/factory.py`: `ClientFactory` selects provider based on `cfg.llm.provider`.
- Supported providers: `anthropic`, `openai`, `qwen` (OpenAI-compatible).
- `src/llm/providers/openai_client.py` and `anthropic_client.py` implement the actual API calls.
- `src/llm/base_client.py`: Abstract interface shared by all providers.

### Tool System (libs/miroflow-tools)

- `manager.py`: `ToolManager` connects to MCP servers over stdio or SSE, lists tools, executes calls, handles blacklisting.
- Each MCP server is a Python module run as a subprocess (`StdioServerParameters`).
- Key servers:
  - `python_mcp_server` — E2B cloud sandbox code execution
  - `microsandbox_docker_mcp_server` — local Docker sandbox (zero API key)
  - `searxng_mcp_server` — local web search (no API key)
  - `crawl4ai_mcp_server` — local web scraping (no API key)
  - `vision_mcp_server`, `vision_mcp_server_os` — commercial / open-source VQA
  - `audio_mcp_server`, `audio_mcp_server_os` — transcription
  - `reasoning_mcp_server`, `reasoning_mcp_server_os` — reasoning engine
  - `reading_mcp_server` — MarkItDown document conversion

## Configuration System

The project uses Hydra for hierarchical YAML configuration.

- `conf/config.yaml` — root config composing `llm`, `agent`, `benchmark`.
- `conf/llm/*.yaml` — provider settings (model name, temperature, base_url, api_key, max_tokens).
- `conf/agent/*.yaml` — tool lists, `max_turns`, `keep_tool_result`, `tool_blacklist`, sub-agents.
- `conf/benchmark/*.yaml` — dataset paths, field mappings, concurrency limits.

Overriding from CLI:
```bash
uv run python main.py llm=claude-3-7 agent=single_agent_keep5 llm.temperature=0.5
```

### Important Agent Parameters

- `max_turns`: Hard limit on LLM interactions (200–600).
- `keep_tool_result`: Recency-based context retention. `-1` keeps all; `K` keeps only the K most recent tool observations.
- `context_compress_limit`: Trigger context compression when exceeded.
- `tool_blacklist`: List of `[server_name, tool_name]` pairs to exclude.

## Testing Instructions

pytest is configured in each `pyproject.toml`:

```bash
# From apps/miroflow-agent or libs/miroflow-tools
uv run pytest
```

Default pytest options (from `pyproject.toml`):
- `-n=auto` — parallel execution via pytest-xdist
- `--cov=miroflow_agent` / `--cov=miroflow_tools` — coverage
- `--html=report.html --self-contained-html` — HTML report
- `-rA` — summary for all outcomes
- `--show-capture=stderr` — only show stderr (logs may contain secrets)

Test markers available (in `libs/miroflow-tools`):
- `unit` — unit tests
- `integration` — integration tests (may be slow)
- `slow` — slow tests
- `requires_api_key` — tests needing real API credentials

**Note:** There are currently no dedicated `tests/` directories in the active source trees. When adding tests, follow the `pyproject.toml` `testpaths` settings (`tests` for `miroflow-agent`, `src/test` for `miroflow-tools`).

## Code Style Guidelines

- **Linter / Formatter:** Ruff 0.8.0 (enforced in CI via `.github/workflows/run-ruff.yml`).
- **License Header:** All source files must include the Apache 2.0 header:
  ```python
  # Copyright (c) 2025 MiroMind
  # This source code is licensed under the Apache 2.0 License.
  ```
  Use `just insert-license` to add headers to staged files, or `just check-license` to verify compliance.
- **Imports:** Use `just sort-imports` to enforce import order.
- **Typing:** Type hints are used throughout. `pyright` is available as a dev dependency for stricter checks.
- **Async:** The agent pipeline is fully async. MCP tool calls, LLM calls, and streaming all use `async`/`await`.
- **String Formatting:** Use f-strings for readability. Log messages may use plain strings.
- **Python Path:** `apps/miroflow-agent/` imports use `src.*` as the package root because `src/__init__.py` exists. Do not rename the `src/` directory without updating `pyproject.toml` and all imports.

## Security Considerations

- **API Keys:** Stored in `apps/miroflow-agent/.env` (copied from `.env.example`). Never commit `.env`.
- **HuggingFace Blocking:** `ToolManager` blocks scraping of `huggingface.co/datasets` and `huggingface.co/spaces` to prevent benchmark answer leakage.
- **Auth (API):** The REST API supports JWT-based auth (`AUTH_ENABLED`, `SHARED_ACCESS_PASSWORD`, `ADMIN_PASSWORD`, `JWT_SECRET`). Disable auth in dev by setting `AUTH_ENABLED=false`.
- **Sandboxing:** Code execution uses E2B cloud sandboxes or local Microsandbox Docker containers. Do not run untrusted code in the host environment.
- **CORS:** The FastAPI app has broad CORS origins configured for local development; tighten for production.
- **Secrets in Logs:** pytest is configured with `--show-capture=stderr` to avoid leaking sensitive data into HTML reports.

## Deployment

### Docker Compose (Recommended)

The `docker-compose.yml` orchestrates four services:
1. **searxng** — Local search engine (port 8080)
2. **crawl4ai** — Local web scraper (port 11235)
3. **miroflow-api** — FastAPI agent backend (port 8002)
4. **mirothinker-web** — Next.js frontend (port 3002)

Environment variables for Docker are defined in `apps/miroflow-agent/.env` and overridden in `docker-compose.yml` for internal service discovery.

### Standalone API Docker Image

`apps/miroflow-agent/Dockerfile` uses a multi-stage build:
- Builder stage: `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` with `uv sync --frozen`
- Runtime stage: `python:3.12-slim` + Docker CLI for microsandbox support

### Frontend Docker Image

`apps/mirothinker-web/Dockerfile` uses Next.js standalone output:
- Build stage: `node:20-alpine` with `npm install && npm run build`
- Runtime stage: copies `.next/standalone` and runs `node server.js`

## Key Files for Quick Reference

| Purpose | Path |
|---------|------|
| Main CLI entry | `apps/miroflow-agent/main.py` |
| API entry | `apps/miroflow-agent/api_server.py` |
| Pipeline factory | `apps/miroflow-agent/src/core/pipeline.py` |
| Orchestrator (main loop) | `apps/miroflow-agent/src/core/orchestrator.py` |
| Tool manager | `libs/miroflow-tools/src/miroflow_tools/manager.py` |
| MCP server parameters builder | `apps/miroflow-agent/src/config/settings.py` |
| LLM client factory | `apps/miroflow-agent/src/llm/factory.py` |
| API task manager | `apps/miroflow-agent/core/task_manager.py` |
| API task executor | `apps/miroflow-agent/core/task_executor.py` |
| Environment example | `apps/miroflow-agent/.env.example` |
| Root Hydra config | `apps/miroflow-agent/conf/config.yaml` |
| Docker Compose | `docker-compose.yml` |
| CI lint workflow | `.github/workflows/run-ruff.yml` |
| Pre-commit tasks | `justfile` |
