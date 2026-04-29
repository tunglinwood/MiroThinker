# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""MiroThinker API routes."""

from .tasks import router as tasks_router
from .health import router as health_router
from .configs import router as configs_router
from .uploads import router as uploads_router
from .auth import router as auth_router
from .admin import router as admin_router
from .smart_search import router as smart_search_router

__all__ = [
    "tasks_router",
    "health_router",
    "configs_router",
    "uploads_router",
    "auth_router",
    "admin_router",
    "smart_search_router",
]
