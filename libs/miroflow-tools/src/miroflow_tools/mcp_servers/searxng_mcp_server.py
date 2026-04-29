# Copyright (c) 2025 MiroMind / OpenClaw
# Adapted from serper_mcp_server.py for SearXNG

import json
import os

import requests
from mcp.server.fastmcp import FastMCP

# SearXNG Configuration
SEARXNG_BASE_URL = os.getenv("SEARXNG_BASE_URL", "http://127.0.0.1:8080")

# Initialize FastMCP server
mcp = FastMCP("searxng-mcp-server")


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
        # All working engines verified 2026-04-29
        if category == "science":
            engines = "pubmed,google scholar,semantic scholar,crossref,arxiv"
        else:
            engines = "brave,duckduckgo,bing,startpage,yandex,mojecha,sepiya,ask,sogou,presearch"

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


if __name__ == "__main__":
    mcp.run()