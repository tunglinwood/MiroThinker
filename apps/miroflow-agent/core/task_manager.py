# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Task state management for MiroThinker API."""

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from api.models.task import TaskResponse, TaskStatus


class TaskManager:
    """Manages task state with in-memory cache and file persistence.

    Tasks are scoped by user_id so each user sees only their own tasks.
    """

    def __init__(self, log_dir: str = "logs/debug"):
        self._tasks: Dict[str, TaskResponse] = {}
        self._lock = threading.RLock()
        self._log_dir = Path(log_dir)
        self._log_dir.mkdir(parents=True, exist_ok=True)
        self._state_file = self._log_dir.parent / "task_state.json"
        self._load_state()

    def create_task(
        self,
        task_id: str,
        task_description: str,
        agent_config: str,
        llm_config: str,
        file_path: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> TaskResponse:
        """Create a new task and register it."""
        now = datetime.now()
        task = TaskResponse(
            id=task_id,
            task_description=task_description,
            agent_config=agent_config,
            llm_config=llm_config,
            status="pending",
            created_at=now,
            updated_at=now,
            current_turn=0,
            max_turns=200,  # Default, will be updated from config
            step_count=0,
            final_answer=None,
            summary=None,
            error_message=None,
            file_info=None,
            log_path=None,
        )

        with self._lock:
            self._tasks[task_id] = task
            if user_id:
                # Store user ownership metadata
                task._user_id = user_id  # type: ignore[attr-defined]
            self._save_state()

        return task

    def get_task(self, task_id: str, user_id: Optional[str] = None) -> Optional[TaskResponse]:
        """Get a task by ID. If user_id is provided, verify ownership."""
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return None
            if user_id is not None:
                owner = getattr(task, "_user_id", None)
                if owner is not None and owner != user_id:
                    return None
            return task

    def update_task(self, task_id: str, updates: Dict[str, Any], user_id: Optional[str] = None) -> Optional[TaskResponse]:
        """Update a task with new data. If user_id is provided, verify ownership."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None
            if user_id is not None:
                owner = getattr(task, "_user_id", None)
                if owner is not None and owner != user_id:
                    return None

            # Update fields
            for key, value in updates.items():
                if hasattr(task, key):
                    setattr(task, key, value)

            # Always update updated_at
            task.updated_at = datetime.now()

            self._tasks[task_id] = task
            self._save_state()
            return task

    def set_status(self, task_id: str, status: TaskStatus, user_id: Optional[str] = None) -> Optional[TaskResponse]:
        """Set task status."""
        return self.update_task(task_id, {"status": status}, user_id=user_id)

    def list_tasks(
        self,
        page: int = 1,
        page_size: int = 20,
        status_filter: Optional[TaskStatus] = None,
        user_id: Optional[str] = None,
    ) -> tuple[List[TaskResponse], int]:
        """List tasks with pagination and optional status/user filters."""
        with self._lock:
            tasks = list(self._tasks.values())

            # Filter by user if specified
            if user_id is not None:
                tasks = [
                    t for t in tasks
                    if getattr(t, "_user_id", None) is None or getattr(t, "_user_id", None) == user_id
                ]

            # Filter by status if specified
            if status_filter:
                tasks = [t for t in tasks if t.status == status_filter]

            # Sort by created_at descending (newest first)
            tasks.sort(key=lambda t: t.created_at, reverse=True)

            # Get total before pagination
            total = len(tasks)

            # Paginate
            start = (page - 1) * page_size
            end = start + page_size
            tasks = tasks[start:end]

            return tasks, total

    def delete_task(self, task_id: str, user_id: Optional[str] = None) -> bool:
        """Delete a task. If user_id is provided, verify ownership."""
        with self._lock:
            if task_id in self._tasks:
                task = self._tasks[task_id]
                if user_id is not None:
                    owner = getattr(task, "_user_id", None)
                    if owner is not None and owner != user_id:
                        return False
                del self._tasks[task_id]
                self._save_state()
                return True
            return False

    def get_all_task_ids(self) -> List[str]:
        """Get all task IDs."""
        with self._lock:
            return list(self._tasks.keys())

    def list_all_tasks(
        self,
        page: int = 1,
        page_size: int = 100,
        status_filter: Optional[TaskStatus] = None,
        user_id: Optional[str] = None,
    ) -> tuple[List[TaskResponse], int]:
        """List ALL tasks without user scoping (admin only). Optional user/status filter."""
        with self._lock:
            tasks = list(self._tasks.values())

            # Filter by user if specified (admin filtering by specific user)
            if user_id is not None:
                tasks = [t for t in tasks if getattr(t, "_user_id", None) == user_id]

            # Filter by status if specified
            if status_filter:
                tasks = [t for t in tasks if t.status == status_filter]

            # Sort by created_at descending (newest first)
            tasks.sort(key=lambda t: t.created_at, reverse=True)

            total = len(tasks)
            start = (page - 1) * page_size
            end = start + page_size
            tasks = tasks[start:end]

            return tasks, total

    def get_users(self) -> List[Dict[str, Any]]:
        """Get all unique users with task statistics."""
        with self._lock:
            user_stats: Dict[str, Dict[str, Any]] = {}
            for task in self._tasks.values():
                uid = getattr(task, "_user_id", None) or "anonymous"
                if uid not in user_stats:
                    user_stats[uid] = {
                        "username": uid,
                        "total_tasks": 0,
                        "active_tasks": 0,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "last_active": task.created_at.isoformat(),
                    }
                stats = user_stats[uid]
                stats["total_tasks"] += 1
                if task.status in ("pending", "running"):
                    stats["active_tasks"] += 1
                elif task.status == "completed":
                    stats["completed_tasks"] += 1
                elif task.status in ("failed", "cancelled"):
                    stats["failed_tasks"] += 1
                if task.updated_at.isoformat() > stats["last_active"]:
                    stats["last_active"] = task.updated_at.isoformat()

            return sorted(user_stats.values(), key=lambda u: u["last_active"], reverse=True)

    def find_log_file(self, task_id: str, user_id: Optional[str] = None) -> Optional[Path]:
        """Find the log file for a task."""
        # If user_id is provided, look in user-specific directory first
        if user_id:
            user_log_dir = self._log_dir / user_id
            if user_log_dir.exists():
                for log_file in user_log_dir.glob("task_*.json"):
                    try:
                        with open(log_file, "r") as f:
                            data = json.load(f)
                            if data.get("task_id") == task_id:
                                return log_file
                    except (json.JSONDecodeError, IOError):
                        continue

        # Fallback: search global log directory
        if not self._log_dir.exists():
            return None

        for log_file in self._log_dir.glob("task_*.json"):
            try:
                with open(log_file, "r") as f:
                    data = json.load(f)
                    if data.get("task_id") == task_id:
                        return log_file
            except (json.JSONDecodeError, IOError):
                continue

        return None

    def read_log_file(self, task_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Read and parse a task's log file."""
        log_file = self.find_log_file(task_id, user_id=user_id)
        if not log_file:
            return None

        try:
            with open(log_file, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None

    def get_progress_from_log(self, task_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Extract progress information from log file."""
        log_data = self.read_log_file(task_id, user_id=user_id)
        if not log_data:
            return {
                "current_turn": 0,
                "step_count": 0,
                "recent_logs": [],
                "messages": [],
            }

        step_logs = log_data.get("step_logs", [])
        current_turn = log_data.get("current_main_turn_id", 0)

        # Get recent logs (last 10)
        recent_logs = step_logs[-10:] if step_logs else []

        # Extract messages from main_agent_message_history
        messages = []
        msg_history = log_data.get("main_agent_message_history", {})
        if isinstance(msg_history, dict):
            history_list = msg_history.get("message_history", [])
            for msg in history_list[-20:]:  # Last 20 messages
                if isinstance(msg, dict):
                    role = msg.get("role", "unknown")
                    content = msg.get("content", "")
                    # Handle list content (multi-part)
                    if isinstance(content, list):
                        text_parts = []
                        for item in content:
                            if isinstance(item, dict) and item.get("type") == "text":
                                text_parts.append(item.get("text", ""))
                        content = "\n".join(text_parts)
                    elif not isinstance(content, str):
                        content = str(content)
                    messages.append({"role": role, "content": content})

        return {
            "current_turn": current_turn,
            "step_count": len(step_logs),
            "recent_logs": recent_logs,
            "messages": messages,
        }

    def _save_state(self) -> None:
        """Persist current task state to disk."""
        try:
            data: Dict[str, Any] = {}
            for tid, task in self._tasks.items():
                entry = task.model_dump(mode="json")
                user_id = getattr(task, "_user_id", None)
                if user_id is not None:
                    entry["user_id"] = user_id
                data[tid] = entry
            tmp_file = self._state_file.with_suffix(".tmp")
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            tmp_file.replace(self._state_file)
        except Exception:
            pass  # Best-effort persistence; never crash the API on write failure

    def _load_state(self) -> None:
        """Restore task state from disk on startup."""
        if not self._state_file.exists():
            return
        try:
            with open(self._state_file, "r", encoding="utf-8") as f:
                data: Dict[str, Any] = json.load(f)
            for tid, entry in data.items():
                user_id = entry.pop("user_id", None)
                # Mark running tasks as failed since their asyncio tasks died
                if entry.get("status") == "running":
                    entry["status"] = "failed"
                    entry["error_message"] = entry.get("error_message", "") or "Task interrupted by server restart"
                task = TaskResponse.model_validate(entry)
                if user_id is not None:
                    task._user_id = user_id  # type: ignore[attr-defined]
                self._tasks[tid] = task
        except Exception:
            pass  # Start fresh if state file is corrupted

    def get_final_result_from_log(self, task_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Extract final result from log file."""
        log_data = self.read_log_file(task_id, user_id=user_id)
        if not log_data:
            return {
                "final_answer": None,
                "summary": None,
                "error": "Log file not found",
            }

        return {
            "final_answer": log_data.get("final_boxed_answer"),
            "summary": None,  # Summary is generated at the end, may not be in log
            "error": log_data.get("error"),
            "status": log_data.get("status", "unknown"),
            "end_time": log_data.get("end_time"),
        }
