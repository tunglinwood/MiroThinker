# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Health check endpoint for MiroThinker API."""

import os

from fastapi import APIRouter, Depends

from api.dependencies import get_task_executor
from api.models.task import HealthResponse
from core.task_executor import TaskExecutor

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(
    task_executor: TaskExecutor = Depends(get_task_executor),
) -> HealthResponse:
    """Check API health status."""
    # Get LLM endpoint from environment
    llm_endpoint = os.environ.get(
        "VISION_BASE_URL",
        os.environ.get("REASONING_BASE_URL", "http://localhost:8001/v1"),
    )

    # Count available tools (approximate)
    tools_available = 5  # Default MiroThinker 1.7 tools

    # Check if task executor is ready
    is_ready = task_executor._main_tool_manager is not None

    return HealthResponse(
        status="healthy" if is_ready else "starting",
        version="1.7.0",
        llm_endpoint=llm_endpoint,
        tools_available=tools_available,
    )
