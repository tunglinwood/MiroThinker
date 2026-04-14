# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Background task execution for MiroThinker API."""

import asyncio
import os
from pathlib import Path
from typing import Dict, Optional

from omegaconf import DictConfig

from api.stream_manager import get_stream_manager
from core.task_manager import TaskManager
from src.core.pipeline import execute_task_pipeline
from src.config.settings import create_mcp_server_parameters
from src.io.output_formatter import OutputFormatter


class TaskExecutor:
    """Executes MiroThinker tasks in background."""

    def __init__(
        self,
        task_manager: TaskManager,
        project_root: Optional[Path] = None,
    ):
        self.task_manager = task_manager
        self.project_root = project_root or Path(__file__).parent.parent
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._main_tool_manager = None
        self._output_formatter = None

    async def initialize_components(self, cfg: DictConfig):
        """Initialize shared components (ToolManager, OutputFormatter)."""
        from miroflow_tools.manager import ToolManager

        # Create tool manager
        server_configs, blacklist = create_mcp_server_parameters(cfg, cfg.agent.main_agent)
        self._main_tool_manager = ToolManager(
            server_configs=server_configs,
            tool_blacklist=blacklist,
        )

        # Create output formatter
        self._output_formatter = OutputFormatter()

    def submit_task(
        self,
        task_id: str,
        task_description: str,
        cfg: DictConfig,
    ) -> None:
        """Submit a task for background execution."""
        # Create async task
        task = asyncio.create_task(
            self._run_task(task_id, task_description, cfg)
        )
        self._running_tasks[task_id] = task

        # Add callback to cleanup when done
        task.add_done_callback(
            lambda t: self._running_tasks.pop(task_id, None)
        )

    async def _run_task(
        self,
        task_id: str,
        task_description: str,
        cfg: DictConfig,
    ) -> None:
        """Execute MiroThinker task asynchronously."""
        # Change to project root for relative imports
        original_cwd = Path.cwd()
        os.chdir(self.project_root)

        # Create stream queue for SSE events
        stream_queue: asyncio.Queue = asyncio.Queue(maxsize=2000)
        stream_manager = get_stream_manager()

        # Spawn consumer to drain stream_queue into StreamManager
        drain_task = asyncio.create_task(
            stream_manager.drain_queue_to_subscribers(task_id, stream_queue)
        )

        try:
            # Update status to running
            self.task_manager.set_status(task_id, "running")

            # Get max_turns from config
            max_turns = 200
            if hasattr(cfg, "main_agent") and hasattr(cfg.main_agent, "max_turns"):
                max_turns = cfg.main_agent.max_turns

            # Update task with max_turns
            self.task_manager.update_task(task_id, {"max_turns": max_turns})

            # Run the pipeline (pass stream_queue for SSE events)
            result = await execute_task_pipeline(
                cfg=cfg,
                task_id=task_id,
                task_description=task_description,
                task_file_name="",
                main_agent_tool_manager=self._main_tool_manager,
                sub_agent_tool_managers={},
                output_formatter=self._output_formatter,
                log_dir="logs/debug",
                stream_queue=stream_queue,
            )

            # Parse result
            final_summary, final_boxed_answer, log_file_path, failure_summary = result

            # Update task as completed
            self.task_manager.update_task(
                task_id,
                {
                    "status": "completed",
                    "final_answer": final_boxed_answer,
                    "summary": final_summary,
                    "log_path": str(log_file_path) if log_file_path else None,
                },
            )

        except asyncio.CancelledError:
            # Task was cancelled
            self.task_manager.set_status(task_id, "cancelled")
            self.task_manager.update_task(
                task_id,
                {"error_message": "Task cancelled by user"},
            )
            raise

        except Exception as e:
            # Task failed
            import traceback
            error_msg = f"{str(e)}\n{traceback.format_exc()}"
            self.task_manager.set_status(task_id, "failed")
            self.task_manager.update_task(
                task_id,
                {"error_message": error_msg},
            )

        finally:
            # Signal stream end and cleanup
            try:
                await stream_queue.put(None)
            except Exception:
                pass
            await asyncio.gather(drain_task, return_exceptions=True)
            stream_manager.cleanup(task_id)

            try:
                os.chdir(original_cwd)
            except Exception:
                pass

    def is_task_running(self, task_id: str) -> bool:
        """Check if a task is currently running."""
        return task_id in self._running_tasks

    def cancel_task(self, task_id: str) -> bool:
        """Cancel a running task."""
        if task_id in self._running_tasks:
            self._running_tasks[task_id].cancel()
            return True
        return False

    def get_running_count(self) -> int:
        """Get number of currently running tasks."""
        return len(self._running_tasks)
