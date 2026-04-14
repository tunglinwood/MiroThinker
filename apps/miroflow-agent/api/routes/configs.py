# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Configuration listing endpoints for MiroThinker API."""

from pathlib import Path

from fastapi import APIRouter

from api.models.task import ConfigListResponse

router = APIRouter(prefix="/api", tags=["configs"])

# MiroFlow config directory (for web app compatibility) — sibling of MiroThinker repo
MIROFLOW_CONFIG_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "MiroFlow" / "config"


def _scan_miroflow_agent_configs() -> list[str]:
    """Scan MiroFlow's config/ directory for agent config files."""
    configs = []
    if MIROFLOW_CONFIG_DIR.exists():
        for f in MIROFLOW_CONFIG_DIR.glob("agent*.yaml"):
            if f.stem not in ["_self_"]:
                configs.append(f"config/{f.name}")
    configs.sort()
    return configs


def _scan_miroflow_llm_configs() -> list[str]:
    """Scan MiroFlow's config/llm/ directory for LLM config files."""
    configs = []
    llm_dir = MIROFLOW_CONFIG_DIR / "llm"
    if llm_dir.exists():
        for f in llm_dir.glob("*.yaml"):
            if f.stem not in ["_self_"]:
                configs.append(f"config/llm/{f.name}")
    configs.sort()
    return configs


@router.get("/configs", response_model=ConfigListResponse)
async def list_configs() -> ConfigListResponse:
    """List available agent and LLM configurations."""
    conf_dir = Path(__file__).parent.parent.parent / "conf"

    # Find MiroThinker agent configs
    agent_dir = conf_dir / "agent"
    agent_configs = []
    if agent_dir.exists():
        for f in agent_dir.glob("*.yaml"):
            # Skip default.yaml and _self_ references
            if f.stem not in ["default", "_self_"]:
                agent_configs.append(f.stem)

    # Find MiroThinker LLM configs
    llm_dir = conf_dir / "llm"
    llm_configs = []
    if llm_dir.exists():
        for f in llm_dir.glob("*.yaml"):
            if f.stem not in ["base", "_self_"]:
                llm_configs.append(f.stem)

    # Find MiroFlow agent configs (for web app compatibility)
    miroflow_configs = _scan_miroflow_agent_configs()
    miroflow_llm_configs = _scan_miroflow_llm_configs()

    # Sort alphabetically
    agent_configs.sort()
    llm_configs.sort()

    # Set defaults
    default_agent = "mirothinker_1.7_microsandbox"
    default_llm = "local-qwen35"

    # Use defaults if available, otherwise first item
    if default_agent not in agent_configs and agent_configs:
        default_agent = agent_configs[0]
    if default_llm not in llm_configs and llm_configs:
        default_llm = llm_configs[0]

    # MiroFlow compatibility: configs/default point to MiroFlow paths
    miroflow_default = "config/agent_web_demo.yaml" if "config/agent_web_demo.yaml" in miroflow_configs else (miroflow_configs[0] if miroflow_configs else default_agent)

    return ConfigListResponse(
        agent_configs=agent_configs,
        llm_configs=llm_configs,
        default_agent=default_agent,
        default_llm=default_llm,
        configs=miroflow_configs or agent_configs,  # MiroFlow compatibility
        default=miroflow_default,  # MiroFlow compatibility
        miroflow_agent_configs=miroflow_configs,
        miroflow_llm_configs=miroflow_llm_configs,
    )
