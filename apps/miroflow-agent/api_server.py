# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""MiroThinker REST API - FastAPI application entry point."""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add project root to path for imports
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Load environment variables
dotenv.load_dotenv(project_root / ".env")

from api.dependencies import init_dependencies, get_task_executor
from api.routes import tasks_router, health_router, configs_router, uploads_router, auth_router
from src.config.settings import create_mcp_server_parameters
from hydra import compose, initialize_config_dir


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print("Starting MiroThinker API...")

    # Create required directories
    log_dir = project_root / "logs" / "debug"
    log_dir.mkdir(parents=True, exist_ok=True)

    # Initialize dependencies
    init_dependencies()

    # Initialize tool manager with default config
    print("Initializing tool manager...")
    try:
        with initialize_config_dir(config_dir="conf"):
            cfg = compose(
                config_name="config",
                overrides=[
                    "agent=mirothinker_1.7_microsandbox",
                    "llm=local-qwen35",
                ],
            )
        task_executor = get_task_executor()
        server_configs = create_mcp_server_parameters(cfg)
        await task_executor.initialize_components(cfg)
        print("Tool manager initialized successfully")
    except Exception as e:
        print(f"Warning: Tool manager initialization deferred: {e}")
        print("Will initialize on first task submission")

    yield

    # Shutdown - cleanup if needed
    print("Shutting down MiroThinker API...")


app = FastAPI(
    title="MiroThinker API",
    description="REST API for MiroThinker AI Research Agent - Deep research with multi-turn tool execution",
    version="1.7.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:5174",  # Vite dev server (fallback port)
        "http://localhost:3000",  # Next.js
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://174.1.21.1:5173",
        "http://174.1.21.1:5174",
        "http://localhost:8080",  # Other common ports
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(tasks_router)
app.include_router(health_router)
app.include_router(configs_router)
app.include_router(uploads_router)
app.include_router(auth_router)


@app.get("/")
async def root():
    """Root endpoint - returns API info."""
    return {
        "name": "MiroThinker API",
        "version": "1.7.0",
        "docs": "/docs",
        "health": "/api/health",
        "tasks": "/api/tasks",
        "configs": "/api/configs",
    }


@app.get("/api")
async def api_info():
    """API information endpoint."""
    return {
        "name": "MiroThinker API",
        "version": "1.7.0",
        "description": "Deep research agent with multi-turn tool execution",
        "endpoints": {
            "tasks": "/api/tasks",
            "health": "/api/health",
            "configs": "/api/configs",
        },
        "documentation": {
            "swagger": "/docs",
            "redoc": "/redoc",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api_server:app",
        host=os.environ.get("API_HOST", "0.0.0.0"),
        port=int(os.environ.get("API_PORT", "8000")),
        reload=os.environ.get("API_RELOAD", "false").lower() == "true",
    )
