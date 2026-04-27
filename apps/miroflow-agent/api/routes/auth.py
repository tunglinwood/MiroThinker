# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Authentication endpoints for MiroThinker API."""

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException, status

from api.middleware.auth import JWT_ALGORITHM, JWT_SECRET
from api.models.auth import AuthEnterRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Token expiry: 7 days
TOKEN_EXPIRE_DAYS = 7


@router.post("/enter", response_model=TokenResponse)
async def enter_app(request: AuthEnterRequest) -> TokenResponse:
    """Enter the application with shared access password.

    Verifies the shared password and returns a JWT token scoped to the username.
    No user database is needed — the password is shared, and the username is
    chosen freely by each user.
    """
    shared_password = os.getenv("SHARED_ACCESS_PASSWORD", "")
    admin_password = os.getenv("ADMIN_PASSWORD", "")

    # Check admin password first — admins can use either password
    is_admin = bool(admin_password and request.password == admin_password)

    # If not admin, check shared password
    if not is_admin:
        # If no password is configured, allow any non-empty password (first-run)
        if shared_password and request.password != shared_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect access password",
            )

    if not request.username.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username cannot be empty",
        )

    # Sanitize username: alphanumeric, underscores, hyphens, max 50 chars
    username = request.username.strip()[:50]
    if not all(c.isalnum() or c in ("_", "-", " ") for c in username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username can only contain letters, numbers, spaces, underscores, and hyphens",
        )

    # Create JWT token
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)

    payload = {
        "username": username,
        "sub": username,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "role": "admin" if is_admin else "user",
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    return TokenResponse(
        access_token=token,
        username=username,
        role="admin" if is_admin else "user",
    )
