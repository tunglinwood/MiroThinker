# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""
Microsandbox Docker-based Python Sandbox MCP Server.

This MCP server provides Python code execution using the microsandbox/python Docker image.
It's a local, no-API-key alternative to E2B for running untrusted Python code.

Docker image: microsandbox/python:latest (contains Python 3.11)

Usage:
    docker run -d --name sandbox-server microsandbox/python:latest
    # Or run run commands directly via docker run --rm microsandbox/python:latest python <code>
"""

import json
import logging
import os
import subprocess
import uuid
from typing import Any, Dict, Optional

from mcp.server.fastmcp import FastMCP
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger("miroflow")

# Configuration
MICROSANDBOX_IMAGE = os.getenv("MICROSANDBOX_IMAGE", "microsandbox/python:latest")
DOCKER_TIMEOUT = int(os.getenv("MICROSANDBOX_DOCKER_TIMEOUT", "60"))

# Initialize FastMCP server
mcp = FastMCP("microsandbox-docker-mcp-server")


def _normalize_code(code: str) -> str:
    """Convert literal ``\\n`` / ``\\t`` to real newlines / tabs.

    Only applies when the code appears to be a single long line
    containing escaped sequences.  If the code already has real
    newlines (as expected after JSON parsing), it is returned
    unchanged so that ``\\n`` inside Python string literals is
    preserved.
    """
    if "\n" in code:
        # Already has real newlines — don't touch \n inside strings
        return code
    code = code.replace("\\n", "\n")
    code = code.replace("\\t", "    ")
    return code.strip()


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((subprocess.TimeoutExpired, RuntimeError)),
)
def _run_docker_command(
    code: str,
    timeout: int = None,
    memory_limit: str = "512m",
    cpu_limit: float = 1.0,
) -> Dict[str, Any]:
    """Run Python code in a Docker container using microsandbox image."""
    timeout = timeout or DOCKER_TIMEOUT

    # Generate unique container name
    container_name = f"sandbox-{uuid.uuid4().hex[:8]}"

    try:
        # Start detached container (microsandbox needs a persistent container)
        subprocess.run(
            [
                "docker", "run", "-d",
                "--name", container_name,
                "--memory", memory_limit,
                "--cpus", str(cpu_limit),
                "--network", "none",
                MICROSANDBOX_IMAGE,
            ],
            capture_output=True, text=True,
        )

        # Pipe code via stdin — avoids shell quoting and permission issues
        result = subprocess.run(
            ["docker", "exec", "-i", container_name, "python"],
            input=code,
            capture_output=True, text=True, timeout=timeout,
        )

        return {
            "success": True,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
            "container": container_name,
        }

    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "kill", container_name], capture_output=True)
        subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)
        return {
            "success": False,
            "error": f"Execution timed out after {timeout} seconds",
            "stdout": "",
            "stderr": "",
            "returncode": -1,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "stdout": "",
            "stderr": "",
            "returncode": -1,
        }
    finally:
        subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((subprocess.TimeoutExpired, RuntimeError)),
)
def _run_docker_command_with_packages(
    code: str,
    packages: list = None,
    timeout: int = None,
) -> Dict[str, Any]:
    """Run Python code with additional packages installed."""
    timeout = timeout or DOCKER_TIMEOUT
    container_name = f"sandbox-{uuid.uuid4().hex[:8]}"

    try:
        # Start detached container (with network for pip install)
        subprocess.run(
            [
                "docker", "run", "-d",
                "--name", container_name,
                "--memory", "512m",
                "--cpus", "1.0",
                MICROSANDBOX_IMAGE,
            ],
            capture_output=True, text=True,
        )

        # Install packages first
        if packages:
            for pkg in packages:
                subprocess.run(
                    ["docker", "exec", container_name, "pip", "install", "--quiet", pkg],
                    capture_output=True, text=True, timeout=timeout + 60,
                )

        # Run code via stdin
        result = subprocess.run(
            ["docker", "exec", "-i", container_name, "python"],
            input=code,
            capture_output=True, text=True, timeout=timeout,
        )

        return {
            "success": True,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }

    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "kill", container_name], capture_output=True)
        subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)
        return {
            "success": False,
            "error": f"Execution timed out after {timeout + 60} seconds",
            "stdout": "",
            "stderr": "",
            "returncode": -1,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "stdout": "",
            "stderr": "",
            "returncode": -1,
        }
    finally:
        subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)


@mcp.tool()
def run_python_code(
    code_block: str,
    timeout: Optional[int] = None,
    memory_limit: str = "512m",
) -> str:
    """
    Execute Python code in an isolated microsandbox Docker container.

    This tool runs Python code in a containerized environment with:
    - No network access (security)
    - Memory limits (default 512MB)
    - CPU limits (default 1 core)
    - Auto-cleanup after execution

    Args:
        code_block: Python code to execute
        timeout: Maximum execution time in seconds (default: 60)
        memory_limit: Memory limit (e.g., "256m", "1g")

    Returns:
        JSON string with stdout, stderr, and return code.

    Example:
        run_python_code("print('Hello, World!')")
        run_python_code("import numpy as np; print(np.mean([1,2,3]))")
    """
    if not code_block or not code_block.strip():
        return json.dumps(
            {"success": False, "error": "Code block is required"},
            ensure_ascii=False,
        )

    result = _run_docker_command(
        _normalize_code(code_block).strip(),
        timeout=timeout,
        memory_limit=memory_limit,
    )

    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def run_python_with_packages(
    code_block: str,
    packages: str,
    timeout: Optional[int] = None,
) -> str:
    """
    Execute Python code with additional packages installed.

    Installs the specified packages via pip, then runs the code.
    Note: This takes longer due to package installation.

    Args:
        code_block: Python code to execute
        packages: Comma-separated list of packages to install (e.g., "numpy,pandas")
        timeout: Maximum execution time in seconds (default: 120)

    Returns:
        JSON string with stdout, stderr, and return code.

    Example:
        run_python_with_packages(
            "import pandas as pd; print(pd.__version__)",
            "pandas"
        )
    """
    if not code_block or not code_block.strip():
        return json.dumps(
            {"success": False, "error": "Code block is required"},
            ensure_ascii=False,
        )

    if not packages or not packages.strip():
        return run_python_code(code_block, timeout)

    package_list = [p.strip() for p in packages.split(",")]

    result = _run_docker_command_with_packages(
        _normalize_code(code_block).strip(),
        packages=package_list,
        timeout=timeout,
    )

    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def check_sandbox_health() -> str:
    """
    Check if the microsandbox Docker environment is healthy.

    Returns:
        Health status information.
    """
    try:
        # Check Docker is running
        docker_check = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if docker_check.returncode != 0:
            return json.dumps({
                "status": "unhealthy",
                "error": "Docker daemon not running",
            }, ensure_ascii=False)

        # Check image is available
        image_check = subprocess.run(
            ["docker", "images", "-q", MICROSANDBOX_IMAGE],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if not image_check.stdout.strip():
            return json.dumps({
                "status": "warning",
                "message": f"Image {MICROSANDBOX_IMAGE} not found. Will pull on first use.",
            }, ensure_ascii=False)

        # Run a simple test
        test_result = _run_docker_command("print('OK')", timeout=30)

        return json.dumps({
            "status": "healthy" if test_result.get("success") else "unhealthy",
            "image": MICROSANDBOX_IMAGE,
            "test_result": test_result,
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({
            "status": "unhealthy",
            "error": str(e),
        }, ensure_ascii=False)


@mcp.tool()
def get_available_packages() -> str:
    """
    Get list of pre-installed packages in the microsandbox image.

    Returns:
        JSON string with list of installed packages.
    """
    code = """
import pkg_resources
installed = [f"{p.project_name}=={p.version}" for p in pkg_resources.working_set]
print("\\n".join(sorted(installed)))
"""
    result = _run_docker_command(code, timeout=30)

    if result.get("success"):
        packages = result.get("stdout", "").strip().split("\n")
        return json.dumps({
            "success": True,
            "packages": packages,
            "count": len(packages),
        }, ensure_ascii=False, indent=2)
    else:
        return json.dumps({
            "success": False,
            "error": result.get("error", "Failed to get package list"),
        }, ensure_ascii=False)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Microsandbox Docker MCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "http"],
        default="stdio",
        help="Transport method (default: stdio)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="Port for HTTP transport (default: 8080)",
    )

    args = parser.parse_args()

    if args.transport == "stdio":
        mcp.run(transport="stdio")
    else:
        mcp.run(transport="streamable-http", port=args.port)
