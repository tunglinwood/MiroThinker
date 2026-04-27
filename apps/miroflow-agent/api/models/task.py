# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Pydantic models for MiroThinker API task management."""

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


TaskStatus = Literal["pending", "running", "completed", "failed", "cancelled"]


class FileInfo(BaseModel):
    """File information for uploaded files."""

    file_id: str
    file_name: str
    file_type: str
    absolute_file_path: str


class TaskCreate(BaseModel):
    """Request model for creating a new task."""

    task_description: str = Field(
        ..., min_length=1, description="The research task/question to process"
    )
    agent_config: str = Field(
        default="mirothinker_1.7_microsandbox",
        description="Agent config name (e.g., mirothinker_1.7_microsandbox)"
    )
    llm_config: str = Field(
        default="local-qwen35",
        description="LLM config name (e.g., local-qwen35)"
    )
    config_path: Optional[str] = Field(
        default=None,
        description="MiroFlow compatibility: config path like 'config/agent_web_demo.yaml'"
    )
    file_path: Optional[str] = Field(default=None, description="Path to input file")
    file_id: Optional[str] = Field(
        default=None,
        description="MiroFlow compatibility: uploaded file ID"
    )


class TaskResponse(BaseModel):
    """Response model for task data."""

    id: str
    task_description: str
    agent_config: str
    llm_config: str
    status: TaskStatus
    created_at: datetime
    updated_at: datetime

    # Progress info
    current_turn: int = 0
    max_turns: int = 0
    step_count: int = 0

    # Results (populated when completed)
    final_answer: Optional[str] = None
    summary: Optional[str] = None
    error_message: Optional[str] = None

    # File info
    file_info: Optional[FileInfo] = None

    # Log path for debugging
    log_path: Optional[str] = None


class TaskListResponse(BaseModel):
    """Response model for task list."""

    tasks: list[TaskResponse]
    total: int
    page: int
    page_size: int


class Message(BaseModel):
    """Model for LLM conversation message."""

    role: str
    content: str


class TaskStatusUpdate(BaseModel):
    """Model for polling status updates (lightweight)."""

    id: str
    status: TaskStatus
    current_turn: int = 0
    step_count: int = 0
    recent_logs: list[dict[str, Any]] = Field(default_factory=list)
    messages: list[Message] = Field(default_factory=list)
    final_answer: Optional[str] = None
    summary: Optional[str] = None
    error_message: Optional[str] = None


class TaskResult(BaseModel):
    """Response model for task result."""

    id: str
    status: TaskStatus
    final_answer: Optional[str] = None
    summary: Optional[str] = None
    log_path: Optional[str] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class HealthResponse(BaseModel):
    """Response model for health check."""

    status: str
    version: str
    llm_endpoint: Optional[str] = None
    tools_available: int = 0


class ConfigListResponse(BaseModel):
    """Response model for config list."""

    agent_configs: list[str]
    llm_configs: list[str]
    default_agent: str
    default_llm: str
    # MiroFlow frontend compatibility
    configs: list[str] = Field(default_factory=list)
    default: str = ""
    # MiroFlow raw config lists (for advanced clients)
    miroflow_agent_configs: list[str] = Field(default_factory=list)
    miroflow_llm_configs: list[str] = Field(default_factory=list)


class ServiceStatus(BaseModel):
    """Status of a single service in admin health check."""

    status: str
    response_time_ms: Optional[int] = None
    url: Optional[str] = None
    details: Optional[str] = None


class AdminHealthResponse(BaseModel):
    """Admin health check with detailed service status."""

    status: str
    version: str
    services: dict[str, ServiceStatus]
    active_tasks: int
    total_users: int
    uptime_seconds: float = 0


class AdminUser(BaseModel):
    """User info for admin dashboard."""

    username: str
    total_tasks: int
    active_tasks: int
    completed_tasks: int
    failed_tasks: int
    last_active: str


class AdminUsersResponse(BaseModel):
    """Response for admin users list."""

    users: list[AdminUser]


class AdminTaskListResponse(BaseModel):
    """Response for admin tasks list."""

    tasks: list[TaskResponse]
    total: int
    page: int
    page_size: int
