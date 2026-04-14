# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MiroThinker is an agent framework for complex task solving with LLMs and MCP (Model Context Protocol) tools. It achieved 88.2% on BrowseComp benchmark. The project consists of:

- **apps/miroflow-agent**: Main agent framework with Hydra-based configuration + REST API
- **libs/miroflow-tools**: MCP server collection providing tools (code execution, web search, vision, audio, reasoning, document reading)

## Quick Commands

```bash
# Install dependencies
cd apps/miroflow-agent && uv sync

# Run agent with custom config
uv run python main.py llm=qwen-3 agent=mirothinker_v1.5_keep5_max200 llm.base_url=http://localhost:61002/v1

# Run agent with FULLY LOCAL setup (zero API keys)
# Requires: SearXNG (port 8080), Crawl4AI (port 11235), microsandbox/python Docker image
uv run python main.py llm=local-qwen35 agent=mirothinker_1.7_microsandbox

# Run REST API server
cd apps/miroflow-agent && uv run uvicorn api_server:app --host 0.0.0.0 --port 8002

# Run benchmark evaluation
uv run python main.py llm=qwen-3 agent=mirothinker_v1.5_keep5_max200 benchmark=gaia-validation-text-103

# Run tests (from apps/miroflow-agent or libs/miroflow-tools)
uv run pytest

# Run single test file
uv run pytest path/to/test.py -v

# Code quality
uv run ruff check src/ api/ core/           # Lint
uv run ruff check --fix src/ api/ core/     # Auto-fix
uv run black .                              # Format
uv run mypy src/ api/ core/ --ignore-missing-imports  # Type check
uv run bandit -r src/ api/ core/            # Security scan
```

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────┐
│           REST API (FastAPI)            │
│  api_server.py + api/routes/*.py        │
├─────────────────────────────────────────┤
│         Task Management Layer           │
│  core/task_manager.py (state + RLock)   │
│  core/task_executor.py (async workers)  │
├─────────────────────────────────────────┤
│         Agent Pipeline Layer            │
│  src/core/pipeline.py                   │
│  src/core/orchestrator.py               │
├─────────────────────────────────────────┤
│         LLM + Tool Layer                │
│  src/llm/ (providers, factory)          │
│  libs/miroflow-tools/ (MCP servers)     │
└─────────────────────────────────────────┘
```

### Core Components (apps/miroflow-agent/src/)

- **orchestrator.py**: Main coordinator for task execution loop, manages LLM calls, tool execution, context management
- **pipeline.py**: Task pipeline factory creating tool managers and output formatter
- **tool_executor.py**: Executes MCP tool calls with retry logic
- **stream_handler.py**: Handles streaming responses from LLM
- **answer_generator.py**: Generates final answers from agent outputs

### REST API Layer (apps/miroflow-agent/api/)

The API provides a REST interface for programmatic task submission and result retrieval.

- **api_server.py**: FastAPI application entry point with lifespan handler, CORS middleware
- **api/dependencies.py**: Dependency injection for TaskManager and TaskExecutor (thread-safe singletons)
- **api/models/task.py**: Pydantic models for request/response validation
- **api/routes/tasks.py**: Task CRUD endpoints (create, list, get, status, result, delete)
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

### LLM Layer (apps/miroflow-agent/src/llm/)

- **base_client.py**: Abstract interface for LLM providers
- **anthropic_client.py**, **openai_client.py**: Provider implementations
- **factory.py**: LLM client factory based on config

### Configuration System

Hydra-based config in `conf/`:
- **llm/*.yaml**: LLM model configs (qwen-3, claude-3-7, gpt-5, etc.)
- **agent/*.yaml**: Agent configs defining tools, max_turns, context retention
- **benchmark/*.yaml**: Benchmark datasets (gaia, browsecomp, hle, frames, etc.)
- **config.yaml**: Main config merging all above

Key agent strategies:
- `keep_tool_result: K` retains only K most recent tool observations (recency-based context)
- `max_turns`: Limits interaction turns (200-600 depending on config)

### Tool System (libs/miroflow-tools/)

MCP servers provide tools via stdio/SSE transports:
- **tool-python**: E2B/microsandbox for code execution, file operations
- **tool-searxng-search**: Local SearXNG for web search (no API key)
- **tool-crawl4ai**: Local Crawl4AI for web scraping (no API key) - RECOMMENDED
- **jina_scrape_llm_summary**: Jina AI scraping + LLM extraction (legacy, requires API key)
- **tool-vqa**, **tool-transcribe**, **tool-reasoning**: Vision, audio, reasoning (commercial + open-source)
- **tool-reading**: MarkItDown for document conversion

ToolManager (`miroflow_tools/manager.py`) orchestrates multiple MCP servers with blacklisting support.

## Environment Variables

Required in `apps/miroflow-agent/.env` (copy from `.env.example`):

### Default: Fully Local Setup (ZERO API KEYS)

**Default since v1.7:** All agent configs now use local services for code execution and vision.

```bash
# SearXNG for web search (local, open-source)
docker run -d -p 8080:8080 --name searxng searxng/searxng:latest
SEARXNG_BASE_URL="http://127.0.0.1:8080"
SEARXNG_ENABLED="true"

# Crawl4AI for web scraping (local, open-source)
docker run -d -p 11235:11235 --name crawl4ai --shm-size=1g unclecode/crawl4ai:latest
CRAWL4AI_BASE_URL="http://127.0.0.1:11235"
CRAWL4AI_ENABLED="true"

# Microsandbox Docker for code execution (local, no API key)
docker pull microsandbox/python:latest

# Local Vision LLM for tool-vqa-os (image understanding)
# Your local endpoint at http://localhost:8001/v1 must support vision
VISION_MODEL_NAME="qwen3.5"
VISION_API_KEY="not-needed"
VISION_BASE_URL="http://localhost:8001/v1/chat/completions"

# Local Reasoning LLM for tool-reasoning-os
REASONING_MODEL_NAME="qwen3.5"
REASONING_API_KEY="not-needed"
REASONING_BASE_URL="http://localhost:8001/v1/chat/completions"
```

**Note:** Audio transcription (`tool-transcribe-os`) is NOT configured for local deployment since qwen3.5 is not an audio transcription model. Use a dedicated Whisper endpoint if you need audio transcription.

**Run command:**
```bash
uv run python main.py llm=local-qwen35 agent=mirothinker_1.7_microsandbox
```

### Optional: E2B Cloud Execution

If you prefer cloud-based code execution, use `mirothinker_1.7_crawl4ai`:

```bash
E2B_API_KEY=...  # Get free key from https://e2b.dev
```

### Optional: For Benchmark Evaluation
```bash
OPENAI_API_KEY=...  # For LLM-as-Judge evaluation
```

**Note:** Crawl4AI is the default web scraping tool. Microsandbox Docker is the default for code execution. tool-vqa-os uses your local vision LLM at http://localhost:8001/v1.

## Testing

- **pytest** with xdist for parallel execution
- Configured in `pyproject.toml` with coverage and HTML reports
- Test markers: `unit`, `integration`, `slow`, `requires_api_key`

## Important Design Notes

### Hydra Configuration Pattern

All API endpoints that load configs use this pattern (note: absolute path required):

```python
from hydra import compose, initialize_config_dir
from pathlib import Path

config_dir = Path(__file__).parent.parent.parent / "conf"
with initialize_config_dir(config_dir=str(config_dir)):
    cfg = compose(config_name="config", overrides=[f"agent={name}", f"llm={name}"])
```

### MCP Server Parameters

`create_mcp_server_parameters(cfg, agent_cfg)` returns a tuple of `(configs, blacklist)`:
- `configs`: List of dicts with 'name' and 'params' (StdioServerParameters)
- `blacklist`: Set of (server_name, tool_name) tuples to exclude

### Task Lifecycle

```
pending → running → completed
              ↓
              ├──→ failed
              └──→ cancelled
```

Tasks are stored in-memory with `threading.RLock()` protection and persisted to `logs/debug/*.json`.
