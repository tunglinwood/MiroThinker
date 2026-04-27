# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MiroThinker is an agent framework for complex task solving with LLMs and MCP (Model Context Protocol) tools. It achieved 88.2% on BrowseComp benchmark. The project consists of:

- **apps/miroflow-agent**: Main agent framework with Hydra-based configuration + REST API
- **apps/mirothinker-web**: Next.js 14 web frontend with SSE streaming, auth, and admin dashboard
- **libs/miroflow-tools**: MCP server collection providing tools (code execution, web search, vision, reasoning, document reading)

## Quick Commands

### Docker Compose (recommended)

```bash
# Start all services (API + Web + SearXNG + Crawl4AI)
docker compose up -d

# View logs
docker compose logs -f miroflow-api
docker compose logs -f mirothinker-web

# Rebuild and restart after code changes
docker compose down miroflow-api && docker compose build miroflow-api && docker compose up -d miroflow-api

# Stop all services
docker compose down
```

### Agent (local, no Docker)

```bash
# Install dependencies
cd apps/miroflow-agent && uv sync

# Run agent with FULLY LOCAL setup (zero API keys)
# Requires: SearXNG (port 8080), Crawl4AI (port 11235), SGLang serving Qwen 3.5 on port 8001
uv run python main.py llm=local-qwen35 agent=mirothinker_1.7_microsandbox

# Run REST API server locally
cd apps/miroflow-agent && uv run uvicorn api_server:app --host 0.0.0.0 --port 8002

# Run benchmark evaluation
uv run python main.py llm=local-qwen35 agent=mirothinker_1.7_microsandbox benchmark=gaia-validation-text-103
```

### Web App (local dev)

```bash
cd apps/mirothinker-web
npm run dev        # Dev server on port 3002
npm run build      # Production build
npm run lint       # ESLint
```

### Code Quality

```bash
cd apps/miroflow-agent
uv run pytest                         # All tests
uv run pytest path/to/test.py -v      # Single test file
uv run ruff check src/ api/ core/     # Lint
uv run ruff check --fix src/ api/ core/  # Auto-fix
uv run black .                        # Format
uv run mypy src/ api/ core/ --ignore-missing-imports  # Type check
uv run bandit -r src/ api/ core/      # Security scan
```

## Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────┐
│         MiroThinker Web (Next.js :3002)              │
│  SSE streaming + JWT auth + Admin dashboard          │
├──────────────────────────────────────────────────────┤
│         REST API (FastAPI :8002)                     │
│  /api/tasks  /api/auth  /api/admin  /api/health      │
├──────────────────────────────────────────────────────┤
│         Task Management Layer                        │
│  core/task_manager.py (state + RLock)                │
│  core/task_executor.py (async workers)               │
├──────────────────────────────────────────────────────┤
│         Agent Pipeline Layer                         │
│  src/core/pipeline.py  src/core/orchestrator.py      │
├──────────────────────────────────────────────────────┤
│         LLM + MCP Tool Layer                         │
│  src/llm/providers/openai_client.py (Qwen 3.5)      │
│  libs/miroflow-tools/ (MCP servers)                  │
└──────────────────────────────────────────────────────┘
```

### Core Components (apps/miroflow-agent/src/)

- **orchestrator.py**: Main coordinator for task execution loop, manages LLM calls, tool execution, context management
- **pipeline.py**: Task pipeline factory creating tool managers and output formatter
- **tool_executor.py**: Executes MCP tool calls with retry logic
- **stream_handler.py**: Handles streaming responses from LLM
- **answer_generator.py**: Generates final answers from agent outputs

### REST API Layer (apps/miroflow-agent/api/)

- **api_server.py**: FastAPI entry point with lifespan handler, CORS middleware
- **api/dependencies.py**: Dependency injection for TaskManager and TaskExecutor
- **api/models/task.py**: Pydantic models for request/response validation
- **api/models/auth.py**: Auth models (AuthEnterRequest, TokenResponse)
- **api/routes/tasks.py**: Task CRUD endpoints (create, list, get, status, result, delete, telemetry)
- **api/routes/auth.py**: Shared-password auth with JWT, admin role detection
- **api/routes/admin.py**: Admin dashboard endpoints (health, users, tasks)
- **api/routes/health.py**: Health check endpoint
- **api/routes/configs.py**: List available agent/LLM configurations

### API Core Components (apps/miroflow-agent/core/)

- **task_manager.py**: Thread-safe task state management with in-memory cache + file persistence
- **task_executor.py**: Background async task execution wrapping `execute_task_pipeline()`

Key API design patterns:
- **Thread Safety**: `threading.RLock()` protects all shared state in TaskManager
- **Async Execution**: Tasks run via `asyncio.create_task()` in background
- **State Persistence**: Hybrid in-memory dict + JSON file logging
- **Progress Tracking**: Reads from existing `logs/debug/*.json` files during execution

### Web App (apps/mirothinker-web/)

Next.js 14 app router with React Server Components.

- **src/app/page.tsx**: Main page — task list, chat input, turn timeline, activity log
- **src/app/admin/page.tsx**: Admin dashboard — service health, user list, all tasks
- **src/components/turn-timeline.tsx**: Displays agent turns with thinking blocks and tool calls
- **src/components/chat-input.tsx**: Text input with file upload and example prompts
- **src/components/sidebar.tsx**: Chat history sidebar with task list
- **src/lib/api.ts**: API client functions (auth, tasks, admin, SSE)
- **src/lib/sse.ts**: SSE client for real-time task streaming
- **src/lib/parser.ts**: Parses LLM responses — extracts `<use_mcp_tool>`, `<tool_result>`, `<think>`, `` XML tags
- **src/lib/markdown.ts**: Simple markdown-to-HTML renderer

### LLM Layer (apps/miroflow-agent/src/llm/)

- **base_client.py**: Abstract interface for LLM providers
- **openai_client.py**: OpenAI-compatible provider (used for Qwen 3.5 via SGLang)
  - Qwen 3.5 thinking mode: `extra_body.chat_template_kwargs.enable_thinking = True`, `extra_body.separate_reasoning = True`
  - Reasoning content is prepended as `<think>...\n</think>` tags to the assistant message so the web app parser can extract thinking blocks

### MCP Servers (libs/miroflow-tools/src/miroflow_tools/mcp_servers/)

| Server | Purpose | Transport |
|--------|---------|-----------|
| **searxng_mcp_server.py** | Web search via local SearXNG (no API key) | stdio |
| **crawl4ai_mcp_server.py** | Web scraping via local Crawl4AI (no API key) | stdio |
| **microsandbox_docker_mcp_server.py** | Python code execution in Docker sandbox (no API key) | stdio |
| **vision_mcp_server_os.py** | Image understanding via local Qwen 3.5 vision | stdio |
| **reasoning_mcp_server_os.py** | LLM reasoning via local Qwen 3.5 | stdio |
| **audio_mcp_server_os.py** | Audio transcription (requires Whisper endpoint) | stdio |
| **reading_mcp_server.py** | Document conversion via MarkItDown | stdio |
| **serper_mcp_server.py** | Google search via Serper API (cloud) | stdio |
| **searching_google_mcp_server.py** | Google search (legacy) | stdio |
| **searching_sogou_mcp_server.py** | Sogou search (legacy, blacklisted) | stdio |

ToolManager (`miroflow_tools/manager.py`) orchestrates multiple MCP servers with blacklisting support.

## Configuration System

Hydra-based config in `conf/`:
- **llm/*.yaml**: LLM model configs (currently only `local-qwen35.yaml` and `default.yaml`)
- **agent/*.yaml**: Agent configs defining tools, max_turns, context retention
- **benchmark/*.yaml**: Benchmark datasets
- **config.yaml**: Main config merging all above

Key agent strategies:
- `keep_tool_result: K` retains only K most recent tool observations (recency-based context)
- `max_turns`: Limits interaction turns (200-600 depending on config)

All API endpoints that load configs use this pattern (absolute path required):

```python
from hydra import compose, initialize_config_dir
from pathlib import Path

config_dir = Path(__file__).parent.parent.parent / "conf"
with initialize_config_dir(config_dir=str(config_dir)):
    cfg = compose(config_name="config", overrides=[f"agent={name}", f"llm={name}"])
```

## Environment Variables

Required in `apps/miroflow-agent/.env`:

```bash
# Local LLM (SGLang serving Qwen 3.5)
VISION_BASE_URL="http://host.docker.internal:8001/v1/chat/completions"
REASONING_BASE_URL="http://host.docker.internal:8001/v1/chat/completions"

# Auth
SHARED_ACCESS_PASSWORD=changeme
ADMIN_PASSWORD=changeme    # Login with this password → admin role
JWT_SECRET=mirothinker-dev-secret-change-in-production

# Services (Docker Compose overrides these via environment)
SEARXNG_BASE_URL="http://127.0.0.1:8080"
SEARXNG_ENABLED="true"
CRAWL4AI_BASE_URL="http://127.0.0.1:11235"
CRAWL4AI_ENABLED="true"
```

**Note:** In Docker Compose, `host.docker.internal` resolves to the host via `extra_hosts: "host.docker.internal:host-gateway"`. On Linux without Docker Desktop, this requires the `host-gateway` config.

## Docker Infrastructure

Services defined in `docker-compose.yml`:

| Service | Port | Purpose |
|---------|------|---------|
| searxng | 8080 | Local web search |
| crawl4ai | 11235 | Local web scraping |
| miroflow-api | 8002 | Agent API server |
| mirothinker-web | 3002 (maps to 3000) | Web frontend |

## Authentication & Admin

- **Shared password auth**: All users share one password (configurable via `SHARED_ACCESS_PASSWORD`)
- **Admin role**: Login with `ADMIN_PASSWORD` → JWT includes `role: "admin"`
- **Admin dashboard** (`/admin`): Service health, user list, all tasks across users
- Admin link appears in header only for users with `role: "admin"`

## Task Lifecycle

```
pending → running → completed
              ↓
              ├──→ failed
              └──→ cancelled
```

Tasks are stored in-memory with `threading.RLock()` protection and persisted to `logs/debug/*.json`.

## Testing

- **pytest** with xdist for parallel execution
- Configured in `pyproject.toml` with coverage and HTML reports
- Test markers: `unit`, `integration`, `slow`, `requires_api_key`

## Important Design Notes

### MCP Server Parameters

`create_mcp_server_parameters(cfg, agent_cfg)` returns a tuple of `(configs, blacklist)`:
- `configs`: List of dicts with 'name' and 'params' (StdioServerParameters)
- `blacklist`: Set of (server_name, tool_name) tuples to exclude

### Hydra config path (Docker)

In `api_server.py`, always use `Path(__file__).parent / "conf"` for the config directory — relative paths fail inside Docker containers.
