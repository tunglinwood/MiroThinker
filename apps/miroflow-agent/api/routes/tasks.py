# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Task management endpoints for MiroThinker API."""

import asyncio
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
) -> TaskListResponse:
    """List all tasks with pagination and optional status filter."""
    tasks, total = task_manager.list_tasks(
        page=page,
        page_size=page_size,
        status_filter=status,
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
) -> TaskResponse:
    """Get task by ID with current progress."""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # If running, get progress from log file
    if task.status == "running":
        progress = task_manager.get_progress_from_log(task_id)
        task_manager.update_task(
            task_id,
            {
                "current_turn": progress.get("current_turn", 0),
                "step_count": progress.get("step_count", 0),
            },
        )
        # Refresh task object
        task = task_manager.get_task(task_id)

    return task


@router.get("/{task_id}/status", response_model=TaskStatusUpdate)
async def get_task_status(
    task_id: str,
    task_manager: TaskManager = Depends(get_task_manager),
) -> TaskStatusUpdate:
    """Lightweight status endpoint for polling."""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Get progress from log file
    progress = task_manager.get_progress_from_log(task_id)

    return TaskStatusUpdate(
        id=task.id,
        status=task.status,
        current_turn=progress.get("current_turn", task.current_turn),
        step_count=progress.get("step_count", task.step_count),
        recent_logs=progress.get("recent_logs", []),
        messages=progress.get("messages", []),
        final_answer=task.final_answer,
        summary=task.summary,
        error_message=task.error_message,
    )


@router.get("/{task_id}/result", response_model=TaskResult)
async def get_task_result(
    task_id: str,
    task_manager: TaskManager = Depends(get_task_manager),
) -> TaskResult:
    """Get final result for a completed task."""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check if task is completed
    if task.status not in ["completed", "failed", "cancelled"]:
        raise HTTPException(
            status_code=400,
            detail=f"Task is not finished. Current status: {task.status}",
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
) -> dict:
    """Delete a task. Cancels if running."""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Cancel if running
    if task.status == "running":
        task_executor.cancel_task(task_id)
        task_manager.set_status(task_id, "cancelled")

    # Delete from manager
    task_manager.delete_task(task_id)

    return {"message": "Task deleted", "id": task_id}


@router.get("/{task_id}/stream")
async def stream_task_events(
    task_id: str,
    task_manager: TaskManager = Depends(get_task_manager),
) -> EventSourceResponse:
    """SSE endpoint for real-time task progress streaming."""
    task = task_manager.get_task(task_id)
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
                yield {
                    "event": event.get("event", "message"),
                    "data": event.get("data", {}),
                }
        except asyncio.CancelledError:
            raise
        finally:
            stream_manager.unsubscribe(task_id, queue)

    return EventSourceResponse(event_generator())
