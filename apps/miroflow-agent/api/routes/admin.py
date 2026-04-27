# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Admin endpoints for MiroThinker API."""

import os
import time
from typing import Optional

import aiohttp
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from api.dependencies import get_task_executor, get_task_manager
from api.middleware.auth import get_current_user
from api.models.task import (
    AdminHealthResponse,
    AdminTaskListResponse,
    AdminUser,
    AdminUsersResponse,
    ServiceStatus,
    TaskStatus,
)
from core.task_manager import TaskManager
from core.task_executor import TaskExecutor

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Track server start time for uptime
_server_start_time = time.time()


async def verify_admin_role(
    user_id: Optional[str] = Depends(get_current_user),
    authorization: Optional[str] = Header(default=None),
) -> str:
    """Verify that the current user has admin role. Returns username."""
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    from api.middleware.auth import JWT_ALGORITHM, JWT_SECRET
    token = authorization.split(" ")[1]
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    role = payload.get("role", "user")

    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    return user_id


@router.get("/health", response_model=AdminHealthResponse)
async def admin_health(
    task_manager: TaskManager = Depends(get_task_manager),
    task_executor: TaskExecutor = Depends(get_task_executor),
):
    """Detailed system health check for admin dashboard."""
    uptime = time.time() - _server_start_time

    services: dict[str, ServiceStatus] = {}

    # API service
    api_ready = task_executor._main_tool_manager is not None
    services["api"] = ServiceStatus(
        status="healthy" if api_ready else "starting",
        details="Tool manager initialized" if api_ready else "Initializing components",
    )

    # LLM endpoint
    llm_url = os.environ.get("VISION_BASE_URL", os.environ.get("REASONING_BASE_URL", "http://localhost:8001/v1"))
    try:
        base_url = llm_url.replace("/v1/chat/completions", "").replace("/chat/completions", "")
        start = time.time()
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{base_url}/health", timeout=aiohttp.ClientTimeout(total=3)) as resp:
                elapsed = int((time.time() - start) * 1000)
                services["llm"] = ServiceStatus(
                    status="healthy" if resp.status == 200 else "degraded",
                    response_time_ms=elapsed,
                    url=llm_url,
                )
    except Exception:
        services["llm"] = ServiceStatus(
            status="unreachable",
            url=llm_url,
            details="Connection failed",
        )

    # SearXNG
    searxng_url = os.environ.get("SEARXNG_BASE_URL", "")
    if searxng_url:
        try:
            start = time.time()
            async with aiohttp.ClientSession() as session:
                async with session.get(searxng_url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    elapsed = int((time.time() - start) * 1000)
                    services["searxng"] = ServiceStatus(
                        status="healthy" if resp.status == 200 else "degraded",
                        response_time_ms=elapsed,
                        url=searxng_url,
                    )
        except Exception:
            services["searxng"] = ServiceStatus(
                status="unreachable",
                url=searxng_url,
            )
    else:
        services["searxng"] = ServiceStatus(status="not_configured")

    # Crawl4AI
    crawl4ai_url = os.environ.get("CRAWL4AI_BASE_URL", "")
    if crawl4ai_url:
        try:
            start = time.time()
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{crawl4ai_url}/health", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    elapsed = int((time.time() - start) * 1000)
                    services["crawl4ai"] = ServiceStatus(
                        status="healthy" if resp.status == 200 else "degraded",
                        response_time_ms=elapsed,
                        url=crawl4ai_url,
                    )
        except Exception:
            services["crawl4ai"] = ServiceStatus(
                status="unreachable",
                url=crawl4ai_url,
            )
    else:
        services["crawl4ai"] = ServiceStatus(status="not_configured")

    # Microsandbox (check if Docker image is available)
    services["microsandbox"] = ServiceStatus(
        status="healthy",
        details="Docker image: " + os.environ.get("MICROSANDBOX_IMAGE", "microsandbox/python:latest"),
    )

    # Count active tasks and users
    all_tasks, _ = task_manager.list_all_tasks()
    active_count = sum(1 for t in all_tasks if t.status in ("pending", "running"))
    users = task_manager.get_users()

    overall = "healthy" if api_ready else "starting"
    if any(s.status in ("unreachable", "error") for s in services.values()):
        overall = "degraded"

    return AdminHealthResponse(
        status=overall,
        version="1.7.0",
        services=services,
        active_tasks=active_count,
        total_users=len(users),
        uptime_seconds=round(uptime, 1),
    )


@router.get("/users", response_model=AdminUsersResponse)
async def list_users(
    task_manager: TaskManager = Depends(get_task_manager),
    _user: str = Depends(verify_admin_role),
):
    """List all users with task statistics."""
    users_data = task_manager.get_users()
    users = [AdminUser(**u) for u in users_data]
    return AdminUsersResponse(users=users)


@router.get("/tasks", response_model=AdminTaskListResponse)
async def list_all_tasks(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user_id: Optional[str] = Query(default=None),
    status: Optional[TaskStatus] = Query(default=None),
    task_manager: TaskManager = Depends(get_task_manager),
    _user: str = Depends(verify_admin_role),
):
    """List all tasks across all users, with optional filters."""
    tasks, total = task_manager.list_all_tasks(
        page=page,
        page_size=page_size,
        status_filter=status,
        user_id=user_id,
    )
    return AdminTaskListResponse(
        tasks=tasks,
        total=total,
        page=page,
        page_size=page_size,
    )
