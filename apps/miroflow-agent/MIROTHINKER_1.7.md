# MiroThinker 1.7 - Implementation Guide

## Overview

MiroThinker 1.7 is a fully local, zero-API-key deep research agent framework. This guide covers the complete implementation for local deployment.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MiroThinker 1.7 Agent                        │
├─────────────────────────────────────────────────────────────────┤
│  Tools (MCP Servers)                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ tool-searxng    │  │ tool-crawl4ai   │  │ microsandbox    │ │
│  │ Search          │  │ Web Scraping    │  │ Code Execution  │ │
│  │ (port 8080)     │  │ (port 11235)    │  │ (Docker)        │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ tool-vqa-os     │  │ tool-reasoning  │                      │
│  │ Vision LLM      │  │ Reasoning LLM   │                      │
│  │ (port 8001)     │  │ (port 8001)     │                      │
│  └─────────────────┘  └─────────────────┘                      │
├─────────────────────────────────────────────────────────────────┤
│  LLM Backend: qwen3.5 @ http://localhost:8001/v1                │
│  - Context: 131K tokens                                         │
│  - Supports: Text, Vision, Reasoning                            │
└─────────────────────────────────────────────────────────────────┘
```

## Required Services

### 1. SearXNG (Web Search)
```bash
docker run -d -p 8080:8080 --name searxng searxng/searxng:latest
```
- **Port**: 8080
- **Purpose**: Privacy-respecting metasearch engine
- **API Key**: Not required

### 2. Crawl4AI (Web Scraping)
```bash
docker run -d -p 11235:11235 --name crawl4ai --shm-size=1g unclecode/crawl4ai:latest
```
- **Port**: 11235
- **Purpose**: High-performance web scraping with markdown extraction
- **API Key**: Not required

### 3. Microsandbox Docker (Code Execution)
```bash
docker pull microsandbox/python:latest
```
- **Purpose**: Isolated Python code execution
- **API Key**: Not required

### 4. Local LLM (qwen3.5)
```bash
# Example with SGLang
python -m sglang.launch_server \
  --model-path qwen3.5 \
  --port 8001 \
  --context-length 131072 \
  --vision
```
- **Port**: 8001
- **Model**: qwen3.5 (must support vision and reasoning)
- **Context**: 131K tokens

## Configuration Files

### Agent Configs

| Config File | Max Turns | Keep Tool Results | Use Case |
|-------------|-----------|-------------------|----------|
| `mirothinker_1.7_microsandbox.yaml` | 200 | 5 | Default fully local setup |
| `mirothinker_1.7_keep5_max200.yaml` | 200 | 5 | Balanced performance |
| `mirothinker_1.7_keep5_max300.yaml` | 300 | 5 | Complex research tasks |
| `mirothinker_1.7_crawl4ai.yaml` | 200 | 5 | Hybrid (E2B code execution) |

### Tools in MiroThinker 1.7

| Tool | Server | Endpoint | Purpose |
|------|--------|----------|---------|
| `tool-searxng-search` | searxng_mcp_server.py | http://127.0.0.1:8080 | Web search |
| `tool-crawl4ai` | crawl4ai_mcp_server.py | http://127.0.0.1:11235 | Web scraping |
| `microsandbox-docker` | microsandbox_docker_mcp_server.py | Local Docker | Code execution |
| `tool-vqa-os` | vision_mcp_server_os.py | http://localhost:8001/v1 | Vision/language understanding |
| `tool-reasoning-os` | reasoning_mcp_server_os.py | http://localhost:8001/v1 | Complex reasoning |

## Quick Start

### Step 1: Start Required Services
```bash
# Search engine
docker run -d -p 8080:8080 --name searxng searxng/searxng:latest

# Web scraper
docker run -d -p 11235:11235 --name crawl4ai --shm-size=1g unclecode/crawl4ai:latest

# Code execution sandbox
docker pull microsandbox/python:latest
```

### Step 2: Configure Environment
```bash
cd apps/miroflow-agent
cp .env.example .env
```

Edit `.env` with your local settings:
```bash
# Local services (default)
SEARXNG_BASE_URL="http://127.0.0.1:8080"
SEARXNG_ENABLED="true"
CRAWL4AI_BASE_URL="http://127.0.0.1:11235"
CRAWL4AI_ENABLED="true"

# Local LLM
VISION_MODEL_NAME="qwen3.5"
VISION_API_KEY="not-needed"
VISION_BASE_URL="http://localhost:8001/v1/chat/completions"

REASONING_MODEL_NAME="qwen3.5"
REASONING_API_KEY="not-needed"
REASONING_BASE_URL="http://localhost:8001/v1/chat/completions"
```

### Step 3: Run MiroThinker 1.7
```bash
# Fully local setup (recommended)
uv run python main.py llm=local-qwen35 agent=mirothinker_1.7_microsandbox

# Or with custom settings
uv run python main.py llm=local-qwen35 agent=mirothinker_1.7_keep5_max300
```

### Step 4: Set Task
```bash
# Via environment variable
export TASK="Your research question here"
uv run python main.py llm=local-qwen35 agent=mirothinker_1.7_microsandbox
```

## Tool Capabilities

### tool-searxng-search
- **Function**: `searxng_search(q, num=10, language="en", engines="google,duckduckgo,bing,wikipedia")`
- **Returns**: JSON with search results (title, link, snippet, source)
- **Use Case**: Finding current information, fact-checking, discovering sources

### tool-crawl4ai
- **Functions**:
  - `crawl_page(url, include_html=False, extract_links=True)` - Full page crawl
  - `get_markdown(url)` - Get clean markdown
  - `extract_links(url, include_external=True)` - Extract all links
  - `extract_media(url)` - Extract images/videos/audios
  - `execute_js(url, scripts)` - Execute JavaScript on page
- **Use Case**: Deep content extraction from specific URLs

### microsandbox-docker
- **Functions**:
  - `run_python_code(code_block, timeout=60, memory_limit="512m")` - Execute Python
  - `run_python_with_packages(code_block, packages, timeout=120)` - With pip packages
  - `check_sandbox_health()` - Check Docker environment
  - `get_available_packages()` - List pre-installed packages
- **Use Case**: Calculations, data processing, code-based analysis

### tool-vqa-os
- **Function**: `visual_question_answering(image_path_or_url, question)`
- **Model**: qwen3.5 (vision-capable)
- **Use Case**: Image understanding, chart analysis, diagram interpretation

### tool-reasoning-os
- **Function**: `reasoning(question)`
- **Model**: qwen3.5 (with chain-of-thought)
- **Use Case**: Complex problem-solving, multi-step reasoning, puzzles

## Context Management

MiroThinker 1.7 uses recency-based context retention:

| Setting | Value | Description |
|---------|-------|-------------|
| `keep_tool_result` | 5 | Keep only 5 most recent tool observations |
| `context_compress_limit` | 5 | Compress context when exceeding 5 messages |
| `retry_with_summary` | False | Generate failure summary on retry |

## Benchmark Performance

MiroThinker 1.7 achieves strong performance on challenging benchmarks:

| Benchmark | Score | Notes |
|-----------|-------|-------|
| BrowseComp | 74.0% | Deep research |
| BrowseComp-ZH | 75.3% | Chinese deep research |
| GAIA-Val-165 | 82.7% | General AI assistant |
| HLE-Text | 42.9% | Hard language evaluation |

## Troubleshooting

### SearXNG not responding
```bash
# Check container status
docker ps | grep searxng

# Restart if needed
docker restart searxng

# Test endpoint
curl http://127.0.0.1:8080/search?q=test&format=json
```

### Crawl4AI connection failed
```bash
# Check container health
docker ps | grep crawl4ai

# Test endpoint
curl http://127.0.0.1:11235/monitor/health
```

### Microsandbox Docker issues
```bash
# Pull latest image
docker pull microsandbox/python:latest

# Test manually
docker run --rm microsandbox/python:latest python -c "print('Hello')"
```

### LLM endpoint errors
```bash
# Check available models
curl http://localhost:8001/v1/models

# Test chat completion
curl http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3.5","messages":[{"role":"user","content":"Hello"}]}'
```

## Hybrid Setup (Optional)

If you prefer cloud-based code execution, use the `mirothinker_1.7_crawl4ai` config:

```bash
# Add to .env
E2B_API_KEY="your_e2b_key_here"

# Run with E2B
uv run python main.py llm=local-qwen35 agent=mirothinker_1.7_crawl4ai
```

## File Structure

```
apps/miroflow-agent/
├── conf/
│   ├── agent/
│   │   ├── mirothinker_1.7_microsandbox.yaml
│   │   ├── mirothinker_1.7_keep5_max200.yaml
│   │   ├── mirothinker_1.7_keep5_max300.yaml
│   │   └── mirothinker_1.7_crawl4ai.yaml
│   └── llm/
│       └── local-qwen35.yaml
├── src/
│   ├── config/settings.py
│   ├── core/orchestrator.py
│   └── utils/prompt_utils.py
├── .env.example
└── main.py

libs/miroflow-tools/src/miroflow_tools/mcp_servers/
├── searxng_mcp_server.py
├── crawl4ai_mcp_server.py
├── microsandbox_docker_mcp_server.py
├── vision_mcp_server_os.py
└── reasoning_mcp_server_os.py
```

## License

MiroThinker is licensed under the Apache 2.0 License.
