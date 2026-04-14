# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""FastAPI dependencies for MiroThinker API."""

from pathlib import Path

from api.models.task import TaskStatus
from api.stream_manager import get_stream_manager
from core.task_manager import TaskManager
from core.task_executor import TaskExecutor


# Global instances (created at startup)
_task_manager: TaskManager | None = None
_task_executor: TaskExecutor | None = None


def get_project_root() -> Path:
    """Get project root directory."""
    return Path(__file__).parent.parent


def get_log_dir() -> Path:
    """Get log directory."""
    return get_project_root() / "logs" / "debug"


def get_task_manager() -> TaskManager:
    """Get task manager instance."""
    global _task_manager
    if _task_manager is None:
        _task_manager = TaskManager(log_dir=str(get_log_dir()))
    return _task_manager


def get_task_executor() -> TaskExecutor:
    """Get task executor instance."""
    global _task_executor
    if _task_executor is None:
        _task_executor = TaskExecutor(
            task_manager=get_task_manager(),
            project_root=get_project_root(),
        )
    return _task_executor


def init_dependencies() -> None:
    """Initialize all dependencies at startup."""
    global _task_manager, _task_executor
    _task_manager = TaskManager(log_dir=str(get_log_dir()))
    _task_executor = TaskExecutor(
        task_manager=_task_manager,
        project_root=get_project_root(),
    )
    # Initialize StreamManager (creates singleton)
    get_stream_manager()


def get_status_filter(status: TaskStatus | None = None) -> TaskStatus | None:
    """Get status filter for task listing."""
    return status
