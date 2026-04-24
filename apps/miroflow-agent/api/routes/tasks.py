# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Task management endpoints for MiroThinker API."""

import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from hydra import compose, initialize_config_dir
from sse_starlette.sse import EventSourceResponse

from api.dependencies import (
    get_status_filter,
    get_task_executor,
    get_task_manager,
)
from api.middleware.auth import get_current_user
from api.stream_manager import get_stream_manager
from api.models.task import (
    TaskCreate,
    TaskListResponse,
    TaskResponse,
    TaskResult,
    TaskStatus,
    TaskStatusUpdate,
)
from core.task_manager import TaskManager
from core.task_executor import TaskExecutor
from pydantic import BaseModel

# Get absolute path to MiroThinker config directory
config_dir = Path(__file__).parent.parent.parent / "conf"


def _resolve_config(task: TaskCreate) -> tuple[str, str, Path]:
    """Resolve config path, returning (agent_name, llm_name, config_dir_path).

    Handles both MiroThinker agent names and MiroFlow config paths like
    'config/agent_web_demo.yaml'. MiroFlow paths are mapped to the closest
    MiroThinker equivalent since MiroFlow configs use a different Hydra format
    (no config.yaml entry point, different provider class structure).
    """
    agent_config = task.agent_config
    llm_config = task.llm_config
    active_config_dir = config_dir

    if task.config_path and task.config_path.startswith("config/"):
        # MiroFlow-style config path — map to MiroThinker equivalent
        agent_name = task.config_path.split("/")[-1].replace(".yaml", "")
        # Map known MiroFlow agents to MiroThinker equivalents
        miroflow_to_mirothinker = {
            "agent_web_demo": "mirothinker_1.7_microsandbox",
            "agent_quickstart": "demo",
            "agent_quickstart_graph": "demo",
            "agent_quickstart_skill": "demo",
            "agent_single-test": "demo",
        }
        mapped = miroflow_to_mirothinker.get(agent_name)
        if mapped:
            agent_config = mapped
        elif agent_name in [a for a in Path(config_dir / "agent").glob("*.yaml") if a.stem not in ("default", "_self_")]:
            # If the agent name happens to exist in MiroThinker, use it directly
            agent_config = agent_name
        else:
            agent_config = "mirothinker_1.7_microsandbox"

    return agent_config, llm_config, active_config_dir

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(
    task: TaskCreate,
    task_manager: TaskManager = Depends(get_task_manager),
    task_executor: TaskExecutor = Depends(get_task_executor),
    user_id: Optional[str] = Depends(get_current_user),
) -> TaskResponse:
    """Create and start a new research task."""
    task_id = f"task_{uuid.uuid4().hex[:12]}"

    # Resolve config_path (MiroFlow compatibility) → agent_config + config_dir
    agent_config, llm_config, active_config_dir = _resolve_config(task)

    # Resolve file_id (MiroFlow compatibility) → file_path
    file_path = task.file_path
    if task.file_id:
        from pathlib import Path as _Path
        upload_dir = _Path(__file__).parent.parent.parent / "uploads" / task.file_id
        if upload_dir.exists():
            files = list(upload_dir.iterdir())
            if files:
                file_path = str(files[0].absolute())

    # Initialize tool manager if not already done
    if task_executor._main_tool_manager is None:
        # Load config to initialize components
        with initialize_config_dir(config_dir=str(active_config_dir)):
            cfg = compose(
                config_name="config",
                overrides=[
                    f"agent={agent_config}",
                    f"llm={llm_config}",
                ],
            )
        await task_executor.initialize_components(cfg)

    # Create task record
    task_response = task_manager.create_task(
        task_id=task_id,
        task_description=task.task_description,
        agent_config=agent_config,
        llm_config=llm_config,
        file_path=file_path,
        user_id=user_id,
    )

    # Load config for execution
    with initialize_config_dir(config_dir=str(active_config_dir)):
        cfg = compose(
            config_name="config",
            overrides=[
                f"agent={agent_config}",
                f"llm={llm_config}",
            ],
        )

    # Submit for background execution
    task_executor.submit_task(
        task_id=task_id,
        task_description=task.task_description,
        cfg=cfg,
    )

    return task_response


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[TaskStatus] = Depends(get_status_filter),
    task_manager: TaskManager = Depends(get_task_manager),
    user_id: Optional[str] = Depends(get_current_user),
) -> TaskListResponse:
    """List all tasks with pagination and optional status filter."""
    tasks, total = task_manager.list_tasks(
        page=page,
        page_size=page_size,
        status_filter=status,
        user_id=user_id,
    )
    return TaskListResponse(
        tasks=tasks,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    task_manager: TaskManager = Depends(get_task_manager),
    task_executor: TaskExecutor = Depends(get_task_executor),
    user_id: Optional[str] = Depends(get_current_user),
) -> TaskResponse:
    """Get task by ID with current progress."""
    task = task_manager.get_task(task_id, user_id=user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # If running, get progress from log file
    if task.status == "running":
        progress = task_manager.get_progress_from_log(task_id, user_id=user_id)
        task_manager.update_task(
            task_id,
            {
                "current_turn": progress.get("current_turn", 0),
                "step_count": progress.get("step_count", 0),
            },
            user_id=user_id,
        )
        # Refresh task object
        refreshed = task_manager.get_task(task_id, user_id=user_id)
        if refreshed:
            task = refreshed

    assert task is not None
    return task


@router.get("/{task_id}/status", response_model=TaskStatusUpdate)
async def get_task_status(
    task_id: str,
    task_manager: TaskManager = Depends(get_task_manager),
    user_id: Optional[str] = Depends(get_current_user),
) -> TaskStatusUpdate:
    """Lightweight status endpoint for polling."""
    task = task_manager.get_task(task_id, user_id=user_id)

    # If not in memory, try to load from log file
    if not task:
        log_data = task_manager.read_log_file(task_id, user_id=user_id)
        if log_data:
            status = log_data.get("status", "unknown")
            if status == "success":
                status = "completed"
            # Also load messages for fallback
            progress = task_manager.get_progress_from_log(task_id, user_id=user_id)
            boxed = log_data.get("final_boxed_answer", "")
            # If boxed answer failed, use last assistant message
            final_answer = boxed if boxed and "No \\boxed{}" not in boxed else ""
            if not final_answer:
                for msg in reversed(progress.get("messages", [])):
                    if msg.get("role") == "assistant":
                        final_answer = msg.get("content", "")
                        break
            return TaskStatusUpdate(
                id=task_id,
                status=status,
                current_turn=log_data.get("current_main_turn_id", 0),
                step_count=len(log_data.get("step_logs", [])),
                recent_logs=[],
                messages=progress.get("messages", []),
                final_answer=final_answer or None,
                summary=None,
                error_message=log_data.get("error"),
            )
        raise HTTPException(status_code=404, detail="Task not found")

    # Get progress from log file
    progress = task_manager.get_progress_from_log(task_id, user_id=user_id)

    # For completed/failed/cancelled tasks, read final_answer from log file
    final_answer = task.final_answer
    summary = task.summary
    error_message = task.error_message
    if task.status in ("completed", "failed", "cancelled"):
        log_data = task_manager.read_log_file(task_id, user_id=user_id)
        if log_data:
            # Log stores as final_boxed_answer, map to final_answer
            boxed = log_data.get("final_boxed_answer", "")
            if not final_answer and boxed and "No \\boxed{}" not in (boxed or ""):
                final_answer = boxed
            if not summary and log_data.get("summary"):
                summary = log_data["summary"]
            if not error_message and log_data.get("error"):
                error_message = log_data["error"]

            # If boxed answer failed, use last assistant message as fallback
            if not final_answer or "No \\boxed{}" in final_answer:
                messages = progress.get("messages", [])
                for msg in reversed(messages):
                    if msg.get("role") == "assistant":
                        final_answer = msg.get("content", "")
                        break

    return TaskStatusUpdate(
        id=task.id,
        status=task.status,
        current_turn=progress.get("current_turn", task.current_turn),
        step_count=progress.get("step_count", task.step_count),
        recent_logs=progress.get("recent_logs", []),
        messages=progress.get("messages", []),
        final_answer=final_answer,
        summary=summary,
        error_message=error_message,
    )


@router.get("/{task_id}/result", response_model=TaskResult)
async def get_task_result(
    task_id: str,
    task_manager: TaskManager = Depends(get_task_manager),
    user_id: Optional[str] = Depends(get_current_user),
) -> TaskResult:
    """Get final result for a completed task."""
    task = task_manager.get_task(task_id, user_id=user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check if task is completed
    if task.status not in ["completed", "failed", "cancelled"]:
        return TaskResult(
            id=task.id,
            status=task.status,
            final_answer=None,
            summary=None,
            log_path=task.log_path,
            completed_at=None,
            error_message=None,
        )

    # Get result from log file
    result_data = task_manager.get_final_result_from_log(task_id)

    # Parse end_time if available
    completed_at = None
    if result_data.get("end_time"):
        try:
            completed_at = datetime.strptime(
                result_data["end_time"], "%Y-%m-%d %H:%M:%S"
            )
        except ValueError:
            completed_at = task.updated_at

    return TaskResult(
        id=task.id,
        status=task.status,
        final_answer=result_data.get("final_answer") or task.final_answer,
        summary=result_data.get("summary") or task.summary,
        log_path=task.log_path,
        completed_at=completed_at,
        error_message=task.error_message or result_data.get("error"),
    )


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    task_manager: TaskManager = Depends(get_task_manager),
    task_executor: TaskExecutor = Depends(get_task_executor),
    user_id: Optional[str] = Depends(get_current_user),
) -> dict:
    """Delete a task. Cancels if running."""
    task = task_manager.get_task(task_id, user_id=user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Cancel if running
    if task.status == "running":
        task_executor.cancel_task(task_id)
        task_manager.set_status(task_id, "cancelled", user_id=user_id)

    # Delete from manager
    task_manager.delete_task(task_id, user_id=user_id)

    return {"message": "Task deleted", "id": task_id}


@router.get("/{task_id}/stream")
async def stream_task_events(
    task_id: str,
    task_manager: TaskManager = Depends(get_task_manager),
    user_id: Optional[str] = Depends(get_current_user),
) -> EventSourceResponse:
    """SSE endpoint for real-time task progress streaming."""
    task = task_manager.get_task(task_id, user_id=user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    stream_manager = get_stream_manager()

    async def event_generator():
        queue = stream_manager.subscribe(task_id)
        try:
            while True:
                event = await queue.get()
                if event is None:
                    # Sentinel: stream ended
                    yield {"event": "done", "data": "{}"}
                    return
                # Convert data dict to JSON string to avoid sse_starlette's str() serialization
                raw_data = event.get("data", {})
                yield {
                    "event": event.get("event", "message"),
                    "data": json.dumps(raw_data, ensure_ascii=False) if isinstance(raw_data, dict) else raw_data,
                }
        except asyncio.CancelledError:
            raise
        finally:
            stream_manager.unsubscribe(task_id, queue)

    return EventSourceResponse(event_generator())


# --- Telemetry endpoint ---

class ToolCallTelemetry(BaseModel):
    tool_name: str
    server_name: str
    arguments: dict
    duration_ms: int
    success: bool
    result_preview: str

class TurnTelemetry(BaseModel):
    turn: int
    input_tokens: int
    output_tokens: int
    context_tokens: int
    context_limit: int
    tool_calls: list[ToolCallTelemetry]
    message_retention: str
    response_status: str
    duration_ms: int | None = None

class TaskTelemetryResponse(BaseModel):
    total_input_tokens: int
    total_output_tokens: int
    context_limit: int
    turns: list[TurnTelemetry]
    env_info: dict
    duration_seconds: float
    tool_usage_summary: dict[str, int]
    start_time: str
    end_time: str


def _parse_duration_ms(duration_str: str) -> int:
    """Extract duration in ms from a tool call message like 'Tool X completed in 7520ms'."""
    try:
        import re
        match = re.search(r'(\d+)ms', duration_str)
        return int(match.group(1)) if match else 0
    except (AttributeError, ValueError):
        return 0


def _extract_tool_call_info(step: dict) -> dict:
    """Extract tool call details from a Tool Call Start or Tool Call step."""
    msg = step.get("message", "")
    meta = step.get("metadata", {}) or {}
    args = meta.get("arguments", {})

    import re
    tool_name = ""
    server_name = ""

    # Pattern 1: "Tool 'name' (server: 'server')" — from Tool Call Start
    if "tool '" in msg.lower() and "server '" in msg.lower():
        m = re.search(r"tool '(\w+)'", msg, re.IGNORECASE)
        if m:
            tool_name = m.group(1)
        m = re.search(r"server '([^']+)'", msg, re.IGNORECASE)
        if m:
            server_name = m.group(1)

    # Pattern 2: "Tool <name> completed in <ms>ms" — from Tool Call result
    elif "Tool" in msg and "completed in" in msg:
        m = re.search(r"Tool\s+(\w+)\s+completed", msg)
        if m:
            tool_name = m.group(1)
        # Server name not available in this format — try metadata
        server_name = meta.get("server_name", "")

    # Pattern 3: Legacy format with quotes
    if not tool_name and "Tool '" in msg:
        m = re.search(r"Tool '(\w+)' \(server: '([^']+)'\)", msg)
        if m:
            tool_name = m.group(1)
            server_name = m.group(2)

    return {
        "tool_name": tool_name,
        "server_name": server_name,
        "arguments": args if isinstance(args, dict) else {},
    }


@router.get("/{task_id}/telemetry", response_model=TaskTelemetryResponse)
async def get_task_telemetry(
    task_id: str,
    task_manager: TaskManager = Depends(get_task_manager),
    user_id: Optional[str] = Depends(get_current_user),
) -> TaskTelemetryResponse:
    """Get detailed telemetry for a task including per-turn token usage, context tracking, and tool call timing."""
    log_data = task_manager.read_log_file(task_id, user_id=user_id)
    if not log_data:
        raise HTTPException(status_code=404, detail="Task log file not found")

    step_logs = log_data.get("step_logs", [])
    env_info = log_data.get("env_info", {})
    start_time = log_data.get("start_time", "")
    end_time = log_data.get("end_time", "")

    # Calculate duration
    duration_seconds = 0.0
    if start_time and end_time:
        try:
            from datetime import datetime
            t_start = datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S")
            t_end = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
            duration_seconds = (t_end - t_start).total_seconds()
        except ValueError:
            pass

    # Parse per-turn telemetry
    turns: dict[int, dict] = {}
    current_turn = 0
    pending_tool_start: dict | None = None
    tool_usage: dict[str, int] = {}

    for step in step_logs:
        step_name = step.get("step_name", "")

        # Detect turn changes
        turn_match = None
        import re
        if "Turn:" in step_name:
            turn_match = re.search(r"Turn: (\d+)", step_name)
        if turn_match:
            current_turn = int(turn_match.group(1))

        if current_turn not in turns:
            turns[current_turn] = {
                "turn": current_turn,
                "input_tokens": 0,
                "output_tokens": 0,
                "context_tokens": 0,
                "context_limit": 131072,
                "tool_calls": [],
                "message_retention": "",
                "response_status": "",
                "duration_ms": 0,
            }

        turn_data = turns[current_turn]

        # Token usage
        if "Token Usage" in step_name:
            msg = step.get("message", "")
            token_match = re.search(r"Input: (\d+), Output: (\d+)", msg)
            if token_match:
                turn_data["input_tokens"] = int(token_match.group(1))
                turn_data["output_tokens"] = int(token_match.group(2))

        # Context limit
        if "Context" in step_name:
            msg = step.get("message", "")
            ctx_match = re.search(r"(\d+)/(\d+)", msg)
            if ctx_match:
                turn_data["context_tokens"] = int(ctx_match.group(1))
                turn_data["context_limit"] = int(ctx_match.group(2))

        # Message retention
        if "Message Retention" in step_name:
            turn_data["message_retention"] = step.get("message", "")

        # Response status
        if "Response Status" in step_name:
            turn_data["response_status"] = step.get("message", "")

        # Tool call start — capture pending for matching with result
        if "Tool Call Start" in step_name:
            info = _extract_tool_call_info(step)
            if info["tool_name"]:
                pending_tool_start = {**info, "turn": current_turn}

        # Tool call result — match with pending start
        if "Tool Call Success" in step_name or ("Tool Call" in step_name and "Turn" in step_name):
            msg = step.get("message", "")
            duration_ms = _parse_duration_ms(msg)
            turn_data["duration_ms"] += duration_ms

            # Try to extract tool name from the result message
            info = _extract_tool_call_info(step)

            # If not found, fall back to pending_tool_start
            if not info["tool_name"] and pending_tool_start:
                info["tool_name"] = pending_tool_start["tool_name"]
                info["server_name"] = pending_tool_start["server_name"]
                info["arguments"] = info["arguments"] or pending_tool_start.get("arguments", {})
            pending_tool_start = None

            if info["tool_name"]:
                # Track tool usage
                tool_usage[info["tool_name"]] = tool_usage.get(info["tool_name"], 0) + 1

                # Calculate result preview — capture up to 6000 chars for JSON results (15 search results)
                result_preview = ""
                result_match = re.search(r'Result: (.+)', msg, re.DOTALL)
                if result_match:
                    result_preview = result_match.group(1)[:6000]

                turn_data["tool_calls"].append({
                    "tool_name": info["tool_name"],
                    "server_name": info["server_name"],
                    "arguments": info["arguments"],
                    "duration_ms": duration_ms,
                    "success": "Success" in step_name or True,
                    "result_preview": result_preview,
                })

    # Calculate totals
    total_input = sum(t["input_tokens"] for t in turns.values())
    total_output = sum(t["output_tokens"] for t in turns.values())
    context_limit = max((t["context_limit"] for t in turns.values()), default=131072)

    # Build turn list (skip turn 0 which is init)
    turn_list = [
        TurnTelemetry(**t)
        for t in turns.values()
        if t["turn"] > 0
    ]

    return TaskTelemetryResponse(
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        context_limit=context_limit,
        turns=turn_list,
        env_info=env_info if isinstance(env_info, dict) else {},
        duration_seconds=duration_seconds,
        tool_usage_summary=tool_usage,
        start_time=start_time,
        end_time=end_time,
    )
