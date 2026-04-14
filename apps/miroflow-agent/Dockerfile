FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

# Replicate the repo directory structure so uv workspace paths resolve correctly
WORKDIR /workspace

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential && \
    rm -rf /var/lib/apt/lists/*

# Copy the full workspace (libs + apps)
COPY libs /workspace/libs
COPY apps/miroflow-agent /workspace/apps/miroflow-agent

WORKDIR /workspace/apps/miroflow-agent

# Sync dependencies (frozen lockfile)
RUN uv sync --frozen

# Runtime stage
FROM python:3.12-slim

WORKDIR /workspace/apps/miroflow-agent

ENV PYTHONUNBUFFERED=1
ENV PATH="/workspace/apps/miroflow-agent/.venv/bin:$PATH"

# Copy venv and libs from builder
COPY --from=builder /workspace/apps/miroflow-agent/.venv /workspace/apps/miroflow-agent/.venv
COPY --from=builder /workspace/libs/miroflow-tools /workspace/libs/miroflow-tools

# Copy application source (already in builder, but re-copy for clarity)
COPY --from=builder /workspace/apps/miroflow-agent/src ./src
COPY --from=builder /workspace/apps/miroflow-agent/api ./api
COPY --from=builder /workspace/apps/miroflow-agent/core ./core
COPY --from=builder /workspace/apps/miroflow-agent/conf ./conf
COPY --from=builder /workspace/apps/miroflow-agent/api_server.py ./

EXPOSE 8002

CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8002"]
