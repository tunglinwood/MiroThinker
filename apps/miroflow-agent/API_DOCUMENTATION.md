# MiroThinker API Documentation

## Overview

MiroThinker API is a REST API that exposes the deep research capabilities of the MiroThinker AI Research Agent. It enables programmatic submission of complex research tasks with multi-turn tool execution, including web search, web scraping, code execution, and reasoning.

**Base URL:** `http://localhost:8002` (default)

**API Version:** 1.7.0

---

## Quick Start

### 1. Start the API Server

```bash
cd /root/learning/MiroThinker/apps/miroflow-agent
uv run uvicorn api_server:app --host 0.0.0.0 --port 8002
```

### 2. Submit a Research Task

```bash
curl -X POST http://localhost:8002/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task_description": "What is the melting point of Sodium Chloride?",
    "agent_config": "mirothinker_1.7_microsandbox",
    "llm_config": "local-qwen35"
  }'
```

### 3. Poll for Status

```bash
curl http://localhost:8002/api/tasks/{task_id}/status
```

### 4. Get Final Result

```bash
curl http://localhost:8002/api/tasks/{task_id}/result
```

---

## API Endpoints

### Health & Configuration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API info |
| `/api/health` | GET | Health check |
| `/api/configs` | GET | List available configurations |
| `/docs` | GET | Swagger UI (interactive documentation) |
| `/redoc` | GET | ReDoc UI (alternative documentation) |

### Task Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tasks` | POST | Create and start a new research task |
| `/api/tasks` | GET | List all tasks with pagination |
| `/api/tasks/{id}` | GET | Get full task details with progress |
| `/api/tasks/{id}/status` | GET | Lightweight status for polling |
| `/api/tasks/{id}/result` | GET | Get final result (completed tasks only) |
| `/api/tasks/{id}` | DELETE | Cancel/delete a task |

---

## Endpoint Reference

### GET `/`

Returns basic API information.

**Response:**
```json
{
  "name": "MiroThinker API",
  "version": "1.7.0",
  "docs": "/docs",
  "health": "/api/health",
  "tasks": "/api/tasks",
  "configs": "/api/configs"
}
```

---

### GET `/api/health`

Check API health status and LLM connectivity.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.7.0",
  "llm_endpoint": "http://localhost:8001/v1",
  "tools_available": 5
}
```

**Status Values:**
- `healthy` - API and components are ready
- `starting` - Components still initializing

---

### GET `/api/configs`

List available agent and LLM configurations.

**Response:**
```json
{
  "agent_configs": [
    "mirothinker_1.7_crawl4ai",
    "mirothinker_1.7_microsandbox",
    "mirothinker_v1.5_keep5_max200",
    ...
  ],
  "llm_configs": [
    "local-qwen35",
    "qwen-3",
    "claude-3-7",
    ...
  ],
  "default_agent": "mirothinker_1.7_microsandbox",
  "default_llm": "local-qwen35"
}
```

---

### POST `/api/tasks`

Create and start a new research task.

**Request Body:**
```json
{
  "task_description": "Your research question here",
  "agent_config": "mirothinker_1.7_microsandbox",
  "llm_config": "local-qwen35",
  "file_path": null
}
```

**Fields:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `task_description` | string | Yes | - | Your research question or task |
| `agent_config` | string | No | `mirothinker_1.7_microsandbox` | Agent configuration name |
| `llm_config` | string | No | `local-qwen35` | LLM configuration name |
| `file_path` | string | No | `null` | Optional file path for file-based tasks |

**Response (201 Created):**
```json
{
  "id": "task_80cce4e588b8",
  "task_description": "What is the non-clinical and clinical development status of NN9487?",
  "agent_config": "mirothinker_1.7_microsandbox",
  "llm_config": "local-qwen35",
  "status": "pending",
  "created_at": "2026-04-08T15:25:56.521551",
  "updated_at": "2026-04-08T15:25:56.521551",
  "current_turn": 0,
  "max_turns": 200,
  "step_count": 0,
  "final_answer": null,
  "summary": null,
  "error_message": null,
  "file_info": null,
  "log_path": null
}
```

---

### GET `/api/tasks`

List all tasks with pagination.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `page_size` | integer | 20 | Items per page (max 100) |
| `status` | string | - | Filter by status: `pending`, `running`, `completed`, `failed`, `cancelled` |

**Example:**
```bash
curl "http://localhost:8002/api/tasks?page=1&page_size=10&status=completed"
```

**Response:**
```json
{
  "tasks": [...],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

---

### GET `/api/tasks/{task_id}`

Get full task details with current progress.

**Response:**
```json
{
  "id": "task_80cce4e588b8",
  "task_description": "...",
  "agent_config": "mirothinker_1.7_microsandbox",
  "llm_config": "local-qwen35",
  "status": "completed",
  "created_at": "2026-04-08T15:25:56.521551",
  "updated_at": "2026-04-08T15:30:00.000000",
  "current_turn": 0,
  "max_turns": 200,
  "step_count": 129,
  "final_answer": "...",
  "summary": "...",
  "error_message": null,
  "file_info": null,
  "log_path": "logs/debug/task_task_80cce4e588b8_2026-04-08-15-25-56.json"
}
```

---

### GET `/api/tasks/{task_id}/status`

Lightweight status endpoint for polling (recommended for frequent polling).

**Response:**
```json
{
  "id": "task_80cce4e588b8",
  "status": "completed",
  "current_turn": 0,
  "step_count": 129,
  "recent_logs": [
    {
      "step_name": "🧠 LLM | Token Usage",
      "message": "Input: 212908, Output: 6004",
      "timestamp": "2026-04-08 15:30:00",
      "info_level": "info",
      "metadata": {}
    },
    ...
  ],
  "messages": [],
  "final_answer": "...",
  "summary": "...",
  "error_message": null
}
```

---

### GET `/api/tasks/{task_id}/result`

Get final result for completed tasks.

**Response (200 OK):**
```json
{
  "id": "task_80cce4e588b8",
  "status": "completed",
  "final_answer": "...",
  "summary": "============================== Final Answer ==============================\n# Research Summary: ...\n\n## 1. Key Findings...\n...\n",
  "log_path": "logs/debug/task_task_80cce4e588b8_2026-04-08-15-25-56.json",
  "completed_at": "2026-04-08T15:30:00",
  "error_message": ""
}
```

**Error (400 Bad Request):**
```json
{
  "detail": "Task is not finished. Current status: running"
}
```

---

### DELETE `/api/tasks/{task_id}`

Cancel and delete a task.

**Response:**
```json
{
  "message": "Task deleted",
  "id": "task_80cce4e588b8"
}
```

---

## Task Status Lifecycle

```
pending → running → completed
              ↓
              ├──→ failed
              └──→ cancelled
```

| Status | Description |
|--------|-------------|
| `pending` | Task created, waiting to start execution |
| `running` | Task is actively executing (searching, reasoning, etc.) |
| `completed` | Task finished successfully with results |
| `failed` | Task encountered an error |
| `cancelled` | Task was cancelled by user |

---

## Concurrency Support

### All Endpoints Support Concurrent Requests

The MiroThinker API is designed to handle multiple concurrent requests safely:

| Component | Implementation | Thread-Safe |
|-----------|----------------|-------------|
| **Web Server** | FastAPI (ASGI) | ✅ Native async support |
| **Task Storage** | In-memory dict with `threading.RLock()` | ✅ All operations locked |
| **Background Execution** | `asyncio.create_task()` | ✅ Non-blocking async tasks |
| **File I/O** | JSON log reads/writes | ✅ Per-task serialization |

### Endpoint Thread Safety

| Endpoint | Method | Thread-Safe | Lock Type |
|----------|--------|-------------|-----------|
| `/` | GET | ✅ N/A | Static response |
| `/api/health` | GET | ✅ N/A | Static response |
| `/api/configs` | GET | ✅ N/A | Read-only filesystem |
| `/api/tasks` | POST | ✅ | `RLock` on create |
| `/api/tasks` | GET | ✅ | `RLock` on list |
| `/api/tasks/{id}` | GET | ✅ | `RLock` on read |
| `/api/tasks/{id}/status` | GET | ✅ | File read (no lock needed) |
| `/api/tasks/{id}/result` | GET | ✅ | File read (no lock needed) |
| `/api/tasks/{id}` | DELETE | ✅ | `RLock` on delete |

### Test Concurrent Requests

```bash
# Send 10 concurrent task creation requests
for i in {1..10}; do
  curl -X POST http://localhost:8002/api/tasks \
    -H "Content-Type: application/json" \
    -d "{\"task_description\": \"Research task $i\", \"agent_config\": \"mirothinker_1.7_microsandbox\", \"llm_config\": \"local-qwen35\"}" &
done
wait

# Verify all tasks were created
curl http://localhost:8002/api/tasks | jq '.total'
```

### Concurrency Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| **API Requests** | Unlimited | ASGI event loop handles concurrent connections |
| **Background Tasks** | Unlimited | asyncio tasks run concurrently |
| **ToolManager** | Shared instance | Thread-safe, tools execute sequentially per task |
| **LLM Endpoint** | Varies | Your local LLM may have its own concurrency limits |

### Production Deployment

For high-concurrency production use:

```bash
# Run with multiple worker processes
uvicorn api_server:app --host 0.0.0.0 --port 8002 --workers 4

# With gunicorn (recommended for production)
gunicorn api_server:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8002
```

### Considerations

1. **Shared ToolManager** - All tasks share a single ToolManager instance (thread-safe)
2. **LLM Rate Limits** - Your local LLM endpoint may need rate limiting for many concurrent tasks
3. **Memory Usage** - Each running task consumes memory for context and tool results
4. **File I/O** - Log file writes are serialized per task to prevent corruption

---

## Configuration Options

### Agent Configurations

| Config | Description | Max Turns | Context Retention |
|--------|-------------|-----------|-------------------|
| `mirothinker_1.7_microsandbox` | Default - fully local with microsandbox Docker | 200 | Full |
| `mirothinker_1.7_crawl4ai` | Uses Crawl4AI for scraping | 200 | Full |
| `mirothinker_1.7_keep5_max200` | Retains 5 most recent tool results | 200 | Recency (K=5) |
| `mirothinker_v1.5_keep5_max200` | v1.5 agent with recency-based context | 200 | Recency (K=5) |

### LLM Configurations

| Config | Model | Endpoint |
|--------|-------|----------|
| `local-qwen35` | Qwen 3.5 (local) | `http://localhost:8001/v1` |
| `qwen-3` | Qwen 3 (API) | Configured in env |
| `claude-3-7` | Claude 3.7 (API) | Anthropic API |
| `gpt-5` | GPT-5 (API) | OpenAI API |

---

## Best Practices for High-Quality Results

### 1. Write Clear, Specific Task Descriptions

**Good:**
- "What is the non-clinical and clinical development status of NN9487?"
- "Find the melting point of Sodium Chloride with verified sources"
- "Compare the efficacy of oral semaglutide vs injectable semaglutide for weight loss"

**Avoid:**
- Vague queries like "Tell me about drugs"
- Multiple unrelated questions in one task
- Questions that require real-time data (stock prices, weather)

### 2. Choose the Right Agent Configuration

For **complex research requiring many tool calls**:
```json
{
  "agent_config": "mirothinker_1.7_microsandbox",
  "llm_config": "local-qwen35"
}
```

For **quick fact-finding**:
```json
{
  "agent_config": "mirothinker_1.7_keep5_max200",
  "llm_config": "local-qwen35"
}
```

### 3. Poll Efficiently

Use the lightweight `/status` endpoint for polling (every 10-30 seconds):

```python
import time
import requests

task_id = "task_80cce4e588b8"

while True:
    response = requests.get(f"http://localhost:8002/api/tasks/{task_id}/status")
    data = response.json()
    
    if data["status"] == "completed":
        print("Task completed!")
        break
    elif data["status"] == "failed":
        print(f"Task failed: {data['error_message']}")
        break
    
    print(f"Status: {data['status']}, Steps: {data['step_count']}")
    time.sleep(15)  # Poll every 15 seconds
```

### 4. Monitor Progress via Recent Logs

The `/status` endpoint returns `recent_logs` showing:
- LLM calls and token usage
- Tool executions (search, scrape, code)
- Context management decisions
- Final answer generation

```json
{
  "recent_logs": [
    {
      "step_name": "🔍 Search | SearXNG",
      "message": "Executed search: NN9487 clinical development",
      "timestamp": "2026-04-08 15:26:30",
      "info_level": "info"
    },
    {
      "step_name": "🌐 Crawl4AI | Scraping",
      "message": "Successfully scraped 5 URLs",
      "timestamp": "2026-04-08 15:26:45",
      "info_level": "info"
    }
  ]
}
```

### 5. Handle Long-Running Tasks

Complex research tasks may take 2-5 minutes:

| Task Complexity | Estimated Time | Steps |
|-----------------|----------------|-------|
| Simple fact lookup | 30-60 seconds | 20-40 |
| Multi-source research | 2-3 minutes | 60-100 |
| Comprehensive analysis | 5+ minutes | 100-200+ |

For long tasks, consider:
- Using webhook callbacks (if implemented)
- Implementing background job queues
- Setting appropriate HTTP timeouts

### 6. Parse Results Effectively

The `summary` field contains a structured markdown report:

```markdown
# Research Summary: [Topic]

## 1. Key Findings and Main Results
## 2. Important Data and Statistics
## 3. Conclusions and Insights
## 4. Sources and References
```

Extract structured data programmatically:

```python
def parse_summary(summary: str) -> dict:
    sections = summary.split("## ")
    return {
        "title": sections[0].replace("# Research Summary:", "").strip(),
        "findings": sections[1] if len(sections) > 1 else "",
        "data": sections[2] if len(sections) > 2 else "",
        "conclusions": sections[3] if len(sections) > 3 else "",
        "sources": sections[4] if len(sections) > 4 else ""
    }
```

### 7. Error Handling

```python
import requests

def submit_research_task(query: str) -> dict:
    response = requests.post(
        "http://localhost:8002/api/tasks",
        json={
            "task_description": query,
            "agent_config": "mirothinker_1.7_microsandbox",
            "llm_config": "local-qwen35"
        }
    )
    
    if response.status_code != 201:
        raise Exception(f"Failed to create task: {response.text}")
    
    return response.json()

def get_result(task_id: str, timeout: int = 300) -> dict:
    """Wait for task completion with timeout."""
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        response = requests.get(
            f"http://localhost:8002/api/tasks/{task_id}/status"
        )
        data = response.json()
        
        if data["status"] == "completed":
            return requests.get(
                f"http://localhost:8002/api/tasks/{task_id}/result"
            ).json()
        elif data["status"] == "failed":
            raise Exception(f"Task failed: {data['error_message']}")
        
        time.sleep(10)
    
    raise TimeoutError(f"Task {task_id} did not complete within {timeout}s")
```

---

## Example: Complete Python Client

```python
import time
import requests
from typing import Optional

class MiroThinkerClient:
    """Python client for MiroThinker API."""
    
    def __init__(self, base_url: str = "http://localhost:8002"):
        self.base_url = base_url
    
    def health_check(self) -> dict:
        """Check API health."""
        response = requests.get(f"{self.base_url}/api/health")
        response.raise_for_status()
        return response.json()
    
    def list_configs(self) -> dict:
        """List available configurations."""
        response = requests.get(f"{self.base_url}/api/configs")
        response.raise_for_status()
        return response.json()
    
    def submit_task(
        self,
        query: str,
        agent_config: str = "mirothinker_1.7_microsandbox",
        llm_config: str = "local-qwen35"
    ) -> str:
        """Submit a research task and return task ID."""
        response = requests.post(
            f"{self.base_url}/api/tasks",
            json={
                "task_description": query,
                "agent_config": agent_config,
                "llm_config": llm_config
            }
        )
        response.raise_for_status()
        data = response.json()
        return data["id"]
    
    def get_status(self, task_id: str) -> dict:
        """Get task status."""
        response = requests.get(
            f"{self.base_url}/api/tasks/{task_id}/status"
        )
        response.raise_for_status()
        return response.json()
    
    def get_result(self, task_id: str) -> dict:
        """Get final result (task must be completed)."""
        response = requests.get(
            f"{self.base_url}/api/tasks/{task_id}/result"
        )
        response.raise_for_status()
        return response.json()
    
    def wait_for_completion(
        self,
        task_id: str,
        timeout: int = 600,
        poll_interval: int = 15,
        verbose: bool = True
    ) -> dict:
        """Wait for task to complete and return result."""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.get_status(task_id)
            
            if verbose:
                print(f"Status: {status['status']}, "
                      f"Steps: {status['step_count']}, "
                      f"Elapsed: {int(time.time() - start_time)}s")
            
            if status["status"] == "completed":
                return self.get_result(task_id)
            elif status["status"] == "failed":
                raise Exception(f"Task failed: {status.get('error_message', 'Unknown error')}")
            elif status["status"] == "cancelled":
                raise Exception("Task was cancelled")
            
            time.sleep(poll_interval)
        
        raise TimeoutError(
            f"Task {task_id} did not complete within {timeout}s"
        )
    
    def list_tasks(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None
    ) -> dict:
        """List tasks with pagination."""
        params = {"page": page, "page_size": page_size}
        if status:
            params["status"] = status
        
        response = requests.get(
            f"{self.base_url}/api/tasks", params=params
        )
        response.raise_for_status()
        return response.json()
    
    def cancel_task(self, task_id: str) -> dict:
        """Cancel/delete a task."""
        response = requests.delete(
            f"{self.base_url}/api/tasks/{task_id}"
        )
        response.raise_for_status()
        return response.json()


# Example Usage
if __name__ == "__main__":
    client = MiroThinkerClient()
    
    # Check health
    health = client.health_check()
    print(f"API Status: {health['status']}")
    
    # Submit research task
    task_id = client.submit_task(
        "What is the non-clinical and clinical development status of NN9487?"
    )
    print(f"Task ID: {task_id}")
    
    # Wait for completion
    result = client.wait_for_completion(task_id, verbose=True)
    
    # Print result
    print("\n" + "="*60)
    print("RESEARCH RESULT")
    print("="*60)
    print(result["summary"])
```

---

## Example: cURL Commands

```bash
# 1. Check health
curl http://localhost:8002/api/health | jq .

# 2. List available configs
curl http://localhost:8002/api/configs | jq .

# 3. Submit a task
TASK_ID=$(curl -s -X POST http://localhost:8002/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task_description": "What is the melting point of Sodium Chloride?",
    "agent_config": "mirothinker_1.7_microsandbox",
    "llm_config": "local-qwen35"
  }' | jq -r '.id')

echo "Created task: $TASK_ID"

# 4. Poll status (run in loop)
curl http://localhost:8002/api/tasks/$TASK_ID/status | jq '{status, step_count}'

# 5. Get result when completed
curl http://localhost:8002/api/tasks/$TASK_ID/result | jq '.summary'

# 6. List all tasks
curl "http://localhost:8002/api/tasks?page=1&page_size=10" | jq .

# 7. Delete a task
curl -X DELETE http://localhost:8002/api/tasks/$TASK_ID | jq .
```

---

## Troubleshooting

### Task Stuck in "pending" Status

**Cause:** ToolManager not initialized or LLM endpoint unavailable.

**Solution:**
1. Check `/api/health` returns `"status": "healthy"`
2. Verify LLM endpoint is running
3. Check server logs for initialization errors

### Task Fails Immediately

**Cause:** Invalid configuration or missing dependencies.

**Solution:**
1. Verify agent_config exists in `/api/configs`
2. Verify llm_config exists in `/api/configs`
3. Check `.env` file has required environment variables

### No Results in Final Answer

**Cause:** LLM couldn't find a boxed answer format.

**Solution:**
- Check the `summary` field for full research output
- The `final_answer` field requires LaTeX `\boxed{}` format
- Most research tasks will have detailed `summary` even without boxed answer

### High Token Usage

**Cause:** Complex queries requiring many search/scrape iterations.

**Solution:**
- Use more specific queries
- Consider `keep5` agent configs for context pruning
- Monitor `recent_logs` to understand tool usage patterns

---

## Environment Setup

### Required Services

| Service | Port | Purpose |
|---------|------|---------|
| SearXNG | 8080 | Web search (open-source) |
| Crawl4AI | 11235 | Web scraping |
| Microsandbox | 5555 | Code execution sandbox |
| Local LLM | 8001 | Qwen 3.5 for reasoning |

### Docker Setup

```bash
# SearXNG
docker run -d -p 8080:8080 --name searxng searxng/searxng:latest

# Crawl4AI
docker run -d -p 11235:11235 --shm-size=1g --name crawl4ai unclecode/crawl4ai:latest

# Microsandbox
docker pull microsandbox/python:latest
```

### Environment Variables

```bash
# .env file
SEARXNG_BASE_URL="http://127.0.0.1:8080"
SEARXNG_ENABLED="true"

CRAWL4AI_BASE_URL="http://127.0.0.1:11235"
CRAWL4AI_ENABLED="true"

MICROSANDBOX_API_KEY="your_key"
MICROSANDBOX_BASE_URL="http://127.0.0.1:5555"

VISION_BASE_URL="http://localhost:8001/v1/chat/completions"
VISION_API_KEY="not-needed"
VISION_MODEL_NAME="qwen3.5"

REASONING_BASE_URL="http://localhost:8001/v1/chat/completions"
REASONING_API_KEY="not-needed"
REASONING_MODEL_NAME="qwen3.5"
```

---

## Interactive Documentation

Access the interactive Swagger UI at:
- **Swagger UI:** http://localhost:8002/docs
- **ReDoc:** http://localhost:8002/redoc
- **OpenAPI JSON:** http://localhost:8002/openapi.json

---

## Support

For issues and feature requests, please refer to the project repository or contact the MiroMind team.

**License:** Apache 2.0
