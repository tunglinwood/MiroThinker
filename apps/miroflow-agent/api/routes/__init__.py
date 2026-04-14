# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""MiroThinker API routes."""

from .tasks import router as tasks_router
from .health import router as health_router
from .configs import router as configs_router
from .uploads import router as uploads_router

__all__ = [
    "tasks_router",
    "health_router",
    "configs_router",
    "uploads_router",
]
