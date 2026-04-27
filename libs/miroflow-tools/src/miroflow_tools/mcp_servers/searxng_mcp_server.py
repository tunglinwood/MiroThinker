# Copyright (c) 2025 MiroMind / OpenClaw
# Adapted from serper_mcp_server.py for SearXNG

import json
import os
from typing import Any, Dict

import requests
from mcp.server.fastmcp import FastMCP
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .utils import decode_http_urls_in_dict

# SearXNG Configuration
SEARXNG_BASE_URL = os.getenv("SEARXNG_BASE_URL", "http://127.0.0.1:8080")
SEARXNG_API_KEY = os.getenv("SEARXNG_API_KEY", "")  # Not required for local SearXNG

# Initialize FastMCP server
mcp = FastMCP("searxng-mcp-server")


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(
        (requests.ConnectionError, requests.Timeout, requests.HTTPError)
    ),
)
def make_searxng_request(query: str, num_results: int = 20) -> requests.Response:
    """Make HTTP request to SearXNG API."""
    # SearXNG API endpoint
    url = f"{SEARXNG_BASE_URL}/search"

    params = {
        "q": query,
        "format": "json",
        "engines": "startpage",
        "language": "en",
        "num_results": num_results,
    }

    response = requests.get(url, params=params, timeout=60)
    response.raise_for_status()
    return response


@mcp.tool()
def searxng_search(
    q: str,
    num: int = 20,
    language: str = "en",
    category: str = "general",
) -> str:
    """
    Tool to perform web searches via SearXNG and retrieve rich results.

    SearXNG is a privacy-respecting, open metasearch engine that aggregates
    results from multiple search engines.

    For clinical trials, academic papers, or scientific queries, use
    category="science" to search PubMed, Google Scholar, Semantic Scholar, etc.

    Args:
        q: Search query string (required)
        num: Number of results to return (default: 20)
        language: Language code for search results (default: 'en')
        category: Search category - 'general' or 'science' (default: 'general')

    Returns:
        Dictionary containing search results and metadata.
    """
    # Validate required parameter
    if not q or not q.strip():
        return json.dumps(
            {
                "success": False,
                "error": "Search query 'q' is required and cannot be empty",
                "results": [],
            },
            ensure_ascii=False,
        )

    try:
        # Make the API request
        url = f"{SEARXNG_BASE_URL}/search"

        # Choose engines based on category
        # Startpage (Google proxy) provides far better quality for brand-name queries.
        # Bing matches "Intel" to driver downloads and marketing pages instead of
        # financial analysis. Yacy results are low-relevance, Brave is rate-limited,
        # DDG is CAPTCHA-blocked.
        if category == "science":
            engines = "pubmed,google scholar,semantic scholar,crossref,arxiv"
        else:
            engines = "startpage"

        params = {
            "q": q.strip(),
            "format": "json",
            "language": language,
            "engines": engines,
            "num_results": num,
        }

        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()

        data = response.json()

        # Format results similar to Serper for compatibility
        results = []
        if "results" in data:
            for item in data["results"]:
                results.append({
                    "title": item.get("title", ""),
                    "link": item.get("url", ""),
                    "snippet": item.get("content", ""),
                    "source": item.get("engine", ""),
                })

        response_data = {
            "success": True,
            "query": q,
            "category": category,
            "engines": engines,
            "results": results,
            "number_of_results": len(results),
            "source": "searxng",
        }

        return json.dumps(response_data, ensure_ascii=False)

    except requests.ConnectionError as e:
        return json.dumps(
            {"success": False, "error": f"Connection error: {str(e)}", "results": []},
            ensure_ascii=False,
        )
    except requests.Timeout as e:
        return json.dumps(
            {"success": False, "error": f"Timeout: {str(e)}", "results": []},
            ensure_ascii=False,
        )
    except Exception as e:
        return json.dumps(
            {"success": False, "error": f"Unexpected error: {str(e)}", "results": []},
            ensure_ascii=False,
        )


# Alias for compatibility with existing code
def google_search(q: str, **kwargs) -> str:
    """Alias for searxng_search for backward compatibility."""
    return searxng_search(q, **kwargs)


if __name__ == "__main__":
    mcp.run()