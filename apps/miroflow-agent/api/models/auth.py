# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Pydantic models for authentication."""

from pydantic import BaseModel, Field


class AuthEnterRequest(BaseModel):
    """Request to enter the application with shared password."""

    password: str = Field(..., min_length=1, description="Shared access password")
    username: str = Field(
        ..., min_length=1, max_length=50, description="Display name for this session"
    )


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"
    username: str
    role: str = "user"
