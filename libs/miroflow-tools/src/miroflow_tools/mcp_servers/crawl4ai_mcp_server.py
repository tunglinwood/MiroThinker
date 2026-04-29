# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""
Crawl4AI MCP Server - High-performance web scraping using Crawl4AI.

Crawl4AI is a powerful, self-hosted web crawler that provides:
- Cleaned HTML/Markdown extraction
- Link extraction (internal/external)
- Media detection (images, videos, audios)
- JavaScript execution support
- Screenshot/PDF generation
- LLM-based content extraction

Server connects to a local Crawl4AI instance running at http://127.0.0.1:11235
Docker: docker run -d -p 11235:11235 --name crawl4ai --shm-size=1g unclecode/crawl4ai:latest
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

import requests
from mcp.server.fastmcp import FastMCP
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger("miroflow")

# Crawl4AI Configuration
CRAWL4AI_BASE_URL = os.getenv("CRAWL4AI_BASE_URL", "http://127.0.0.1:11235")

# Initialize FastMCP server
mcp = FastMCP("crawl4ai-mcp-server")


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(
        (requests.ConnectionError, requests.Timeout, requests.HTTPError)
    ),
)
def _post_to_crawl4ai(endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Make POST request to Crawl4AI API with retry logic."""
    url = f"{CRAWL4AI_BASE_URL}{endpoint}"
    response = requests.post(url, json=payload, timeout=120)
    response.raise_for_status()
    return response.json()


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(
        (requests.ConnectionError, requests.Timeout, requests.HTTPError)
    ),
)
def _get_from_crawl4ai(endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Make GET request to Crawl4AI API with retry logic."""
    url = f"{CRAWL4AI_BASE_URL}{endpoint}"
    response = requests.get(url, params=params, timeout=60)
    response.raise_for_status()
    return response.json()


def _format_crawl_result(result: Dict[str, Any], include_html: bool = False) -> str:
    """Format Crawl4AI result into readable markdown-style output."""
    if not result.get("success"):
        return f"[ERROR] Crawl failed: {result.get('error_message', 'Unknown error')}"

    output = []

    # Metadata
    metadata = result.get("metadata", {})
    if metadata.get("title"):
        output.append(f"# {metadata['title']}")
    if metadata.get("description"):
        output.append(f"\n**Description**: {metadata['description']}")
    if metadata.get("keywords"):
        output.append(f"\n**Keywords**: {metadata['keywords']}")

    # Content - check for markdown in various formats
    markdown_content = result.get("markdown") or result.get("content")

    # Handle nested markdown structure (Crawl4AI returns dict with raw_markdown, etc.)
    if isinstance(markdown_content, dict):
        # Use raw_markdown if available
        markdown_content = markdown_content.get("raw_markdown", "")

    if markdown_content:
        output.append(f"\n{markdown_content}")
    elif include_html and result.get("cleaned_html"):
        output.append(f"\n{result['cleaned_html']}")
    elif result.get("html"):
        output.append(f"\n{result['html']}")

    # Links
    links = result.get("links", {})
    internal_links = links.get("internal", [])
    external_links = links.get("external", [])
    if internal_links or external_links:
        output.append("\n\n## Links")
        if internal_links:
            output.append("\n### Internal:")
            for link in internal_links[:10]:  # Limit to 10
                href = link.get("href", "")
                text = link.get("text", "").strip()
                output.append(f"- [{text}]({href})")
        if external_links:
            output.append("\n### External:")
            for link in external_links[:10]:
                href = link.get("href", "")
                text = link.get("text", "").strip()
                output.append(f"- [{text}]({href})")

    # Media
    media = result.get("media", {})
    images = media.get("images", [])
    if images:
        output.append(f"\n\n## Images ({len(images)} found)")
        for img in images[:5]:
            src = img.get("src", "")
            alt = img.get("alt", "")
            output.append(f"- ![]({src}) {alt}")

    return "\n".join(output)


@mcp.tool()
def crawl_page(
    url: str,
    include_html: bool = False,
    extract_links: bool = True,
) -> str:
    """
    Crawl a webpage using Crawl4AI and return extracted content as markdown.

    This is the primary tool for web scraping. It fetches the page, extracts
    clean content, and optionally includes links and media information.

    Args:
        url: The URL to crawl (must start with http:// or https://)
        include_html: Include cleaned HTML in response (default: False)
        extract_links: Extract and return internal/external links (default: True)

    Returns:
        Formatted markdown content with metadata, links, and media info.

    Example:
        crawl_page("https://example.com/article")
        crawl_page("https://news.com/story", include_html=True, extract_links=True)
    """
    if not url or not url.strip():
        return json.dumps(
            {"success": False, "error": "URL is required and cannot be empty"},
            ensure_ascii=False,
        )

    if not url.startswith(("http://", "https://")):
        return json.dumps(
            {"success": False, "error": "URL must start with http:// or https://"},
            ensure_ascii=False,
        )

    try:
        # Build crawler config
        crawler_config = {
            "exclude_external_links": False,
            "exclude_social_media_links": False,
        }

        if not extract_links:
            crawler_config["exclude_external_links"] = True

        payload = {
            "urls": [url],
            "crawler_config": crawler_config,
        }

        result = _post_to_crawl4ai("/crawl", payload)

        if "results" in result and len(result["results"]) > 0:
            crawl_result = result["results"][0]
            return _format_crawl_result(crawl_result, include_html)
        elif "result" in result:
            # Direct result format
            return _format_crawl_result(result["result"], include_html)
        else:
            return json.dumps(
                {"success": False, "error": "Unexpected response format", "raw": result},
                ensure_ascii=False,
            )

    except requests.exceptions.Timeout:
        return json.dumps(
            {"success": False, "error": "Request timed out after 120 seconds"},
            ensure_ascii=False,
        )
    except Exception as e:
        logger.error(f"Crawl4AI crawl_page error: {e}")
        return json.dumps(
            {"success": False, "error": str(e)},
            ensure_ascii=False,
        )


@mcp.tool()
def extract_links(url: str, include_external: bool = True) -> str:
    """
    Extract all links from a webpage.

    Args:
        url: The URL to crawl
        include_external: Include external links in results (default: True)

    Returns:
        JSON string with internal and external links.
    """
    if not url or not url.strip():
        return json.dumps(
            {"success": False, "error": "URL is required"},
            ensure_ascii=False,
        )

    try:
        payload = {"urls": [url]}
        result = _post_to_crawl4ai("/crawl", payload)

        if "results" in result and len(result["results"]) > 0:
            links = result["results"][0].get("links", {})
            output = {
                "url": url,
                "internal_links": links.get("internal", []),
            }
            if include_external:
                output["external_links"] = links.get("external", [])

            return json.dumps(output, ensure_ascii=False, indent=2)
        else:
            return json.dumps(
                {"success": False, "error": "No results returned"},
                ensure_ascii=False,
            )

    except Exception as e:
        logger.error(f"Crawl4AI extract_links error: {e}")
        return json.dumps(
            {"success": False, "error": str(e)},
            ensure_ascii=False,
        )


@mcp.tool()
def extract_media(url: str) -> str:
    """
    Extract all media (images, videos, audios) from a webpage.

    Args:
        url: The URL to crawl

    Returns:
        JSON string with detected media elements.
    """
    if not url or not url.strip():
        return json.dumps(
            {"success": False, "error": "URL is required"},
            ensure_ascii=False,
        )

    try:
        payload = {"urls": [url]}
        result = _post_to_crawl4ai("/crawl", payload)

        if "results" in result and len(result["results"]) > 0:
            media = result["results"][0].get("media", {})
            output = {
                "url": url,
                "images": media.get("images", []),
                "videos": media.get("videos", []),
                "audios": media.get("audios", []),
            }
            return json.dumps(output, ensure_ascii=False, indent=2)
        else:
            return json.dumps(
                {"success": False, "error": "No results returned"},
                ensure_ascii=False,
            )

    except Exception as e:
        logger.error(f"Crawl4AI extract_media error: {e}")
        return json.dumps(
            {"success": False, "error": str(e)},
            ensure_ascii=False,
        )


@mcp.tool()
def get_markdown(url: str) -> str:
    """
    Get clean markdown from a webpage using Crawl4AI's markdown endpoint.

    This is a lightweight option that returns only markdown content,
    without links or media extraction.

    Args:
        url: The URL to fetch

    Returns:
        Raw markdown string.
    """
    if not url or not url.strip():
        return "[ERROR] URL is required"

    try:
        payload = {"url": url}
        result = _post_to_crawl4ai("/md", payload)

        if "markdown" in result:
            return result["markdown"]
        elif "content" in result:
            return result["content"]
        else:
            return f"[ERROR] Unexpected response: {result}"

    except Exception as e:
        logger.error(f"Crawl4AI get_markdown error: {e}")
        return f"[ERROR] {str(e)}"


@mcp.tool()
def execute_js(url: str, scripts: List[str]) -> str:
    """
    Execute custom JavaScript on a webpage and get the result.

    Use this for pages that require interaction or have dynamic content.

    Args:
        url: The URL to crawl
        scripts: List of JavaScript code snippets to execute

    Returns:
        Page content after JS execution.

    Example:
        execute_js("https://example.com", ["window.scrollTo(0, document.body.scrollHeight)"])
    """
    if not url or not url.strip():
        return json.dumps(
            {"success": False, "error": "URL is required"},
            ensure_ascii=False,
        )

    if not scripts:
        return json.dumps(
            {"success": False, "error": "At least one script is required"},
            ensure_ascii=False,
        )

    try:
        payload = {
            "url": url,
            "scripts": scripts,
        }
        result = _post_to_crawl4ai("/execute_js", payload)

        if "result" in result:
            return json.dumps(result, ensure_ascii=False, indent=2)
        else:
            return json.dumps(
                {"success": False, "error": "Unexpected response", "raw": result},
                ensure_ascii=False,
            )

    except Exception as e:
        logger.error(f"Crawl4AI execute_js error: {e}")
        return json.dumps(
            {"success": False, "error": str(e)},
            ensure_ascii=False,
        )


@mcp.tool()
def check_health() -> str:
    """
    Check Crawl4AI server health status.

    Returns:
        Health status information.
    """
    try:
        result = _get_from_crawl4ai("/monitor/health")
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"[ERROR] Health check failed: {str(e)}"


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Crawl4AI MCP Server")
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
