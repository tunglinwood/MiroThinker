# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Authentication middleware for MiroThinker API."""

import os
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Configuration
AUTH_ENABLED = os.getenv("AUTH_ENABLED", "true").lower() == "true"
JWT_SECRET = os.getenv("JWT_SECRET", "mirothinker-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[str]:
    """Extract and validate JWT token, return username.

    Returns None when AUTH_ENABLED=false (dev mode).
    Raises HTTPException 401 when token is missing or invalid.
    """
    if not AUTH_ENABLED:
        return None

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )
        username: Optional[str] = payload.get("username")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: no username",
            )
        return username
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
