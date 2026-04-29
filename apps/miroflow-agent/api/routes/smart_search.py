# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""Smart Search + Crawl endpoint — LLM query expansion + SearXNG search + Crawl4AI extraction."""

import asyncio
import json
import logging
import os
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, Response
from openai import AsyncOpenAI
from pydantic import BaseModel

logger = logging.getLogger("miroflow_agent")

router = APIRouter(prefix="/api/smart-search", tags=["smart-search"])

# Service URLs
SEARXNG_BASE_URL = os.getenv("SEARXNG_BASE_URL", "http://127.0.0.1:8080")
CRAWL4AI_BASE_URL = os.getenv("CRAWL4AI_BASE_URL", "http://127.0.0.1:11235")
# Use REASONING_BASE_URL from env, but strip /chat/completions suffix if present
# (AsyncOpenAI appends /chat/completions automatically)
_raw_base = os.getenv("REASONING_BASE_URL", "")
if _raw_base.endswith("/chat/completions"):
    _raw_base = _raw_base[: -len("/chat/completions")]
LLM_BASE_URL = _raw_base or "http://host.docker.internal:8001/v1"
LLM_API_KEY = os.getenv("LLM_API_KEY", "not-needed")
LLM_MODEL = "qwen3.5"


class SmartSearchRequest(BaseModel):
    query: str
    num_results: int = 10
    language: str = "en"
    category: str = "general"
    max_urls: int = 20


async def expand_query_with_llm(query: str) -> List[str]:
    """Use Qwen 3.5 to generate 3 alternative search queries."""
    try:
        client = AsyncOpenAI(
            api_key=LLM_API_KEY,
            base_url=LLM_BASE_URL,
        )

        prompt = (
            f"Given this user query: \"{query}\", generate 3 alternative search queries "
            f"that are more specific and likely to return better web search results. "
            f"Return ONLY a JSON array of strings, nothing else. No markdown, no explanation."
        )

        response = await client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=500,
            extra_body={
                "chat_template_kwargs": {"enable_thinking": False},
            },
        )

        content = response.choices[0].message.content or ""

        # Parse JSON array from response — may be wrapped in ```json...```
        content = content.strip()
        if content.startswith("```"):
            # Strip markdown code blocks
            lines = content.split("\n")
            content = "\n".join(lines[1:-1]) if len(lines) > 2 else content.strip("`")
            content = content.removeprefix("json").strip()

        expanded = json.loads(content)
        if isinstance(expanded, list) and len(expanded) > 0:
            # Deduplicate and limit to 3, prepend original query
            seen = set()
            unique = []
            for q in expanded[:3]:
                if q.lower() not in seen:
                    seen.add(q.lower())
                    unique.append(q)
            return [query] + unique

        return [query]

    except Exception as e:
        logger.warning(f"LLM query expansion failed: {e}, falling back to original query")
        return [query]


async def searxng_search(query: str, num_results: int, language: str, category: str) -> List[Dict[str, str]]:
    """Search SearXNG and return list of {title, url, source}."""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            if category == "science":
                engines_param = "pubmed,google scholar,semantic scholar,crossref,arxiv"
            else:
                # Don't pin to a specific engine — let SearXNG use its defaults
                # (DuckDuckGo is disabled in settings, but wikipedia + startpage work)
                engines_param = None

            params = {
                "q": query,
                "format": "json",
                "language": language,
                "num_results": num_results,
            }
            if engines_param:
                params["engines"] = engines_param

            resp = await client.get(f"{SEARXNG_BASE_URL}/search", params=params)
            resp.raise_for_status()
            data = resp.json()

            results = []
            for item in data.get("results", []):
                title = item.get("title", "")
                url = item.get("url", "")
                source = item.get("engine", "")
                if title and url:
                    results.append({"title": title, "url": url, "source": source})

            return results

    except Exception as e:
        logger.warning(f"SearXNG search failed for '{query}': {e}")
        return []


async def crawl_url(url: str) -> Dict[str, Any]:
    """Crawl a single URL with Crawl4AI and return markdown content."""
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            payload = {
                "urls": [url],
                "crawler_config": {
                    "exclude_external_links": False,
                    "exclude_social_media_links": False,
                },
            }

            resp = await client.post(f"{CRAWL4AI_BASE_URL}/crawl", json=payload)

            # Check for CAPTCHA / blocking
            if resp.status_code in (403, 429):
                body = resp.text.lower()
                if "captcha" in body or "challenge" in body or "cloudflare" in body:
                    return {
                        "url": url,
                        "crawl_status": "blocked",
                        "content": "",
                        "error": "Blocked by CAPTCHA or rate limiter",
                    }

            resp.raise_for_status()
            data = resp.json()

            if "results" in data and len(data["results"]) > 0:
                result = data["results"][0]
                markdown = result.get("markdown") or result.get("content") or ""
                if isinstance(markdown, dict):
                    markdown = markdown.get("raw_markdown", "")
                return {
                    "url": url,
                    "crawl_status": "success",
                    "content": markdown,
                    "error": None,
                }
            elif "result" in data:
                result = data["result"]
                markdown = result.get("markdown") or result.get("content") or ""
                if isinstance(markdown, dict):
                    markdown = markdown.get("raw_markdown", "")
                return {
                    "url": url,
                    "crawl_status": "success",
                    "content": markdown,
                    "error": None,
                }
            else:
                return {
                    "url": url,
                    "crawl_status": "failed",
                    "content": "",
                    "error": f"Unexpected response format: {json.dumps(data)[:500]}",
                }

    except httpx.TimeoutException:
        return {
            "url": url,
            "crawl_status": "timeout",
            "content": "",
            "error": "Crawl request timed out after 120s",
        }
    except httpx.HTTPStatusError as e:
        body = (e.response.text or "").lower()
        if "captcha" in body or "challenge" in body or "cloudflare" in body:
            return {
                "url": url,
                "crawl_status": "blocked",
                "content": "",
                "error": "Blocked by CAPTCHA or rate limiter",
            }
        return {
            "url": url,
            "crawl_status": "failed",
            "content": "",
            "error": f"HTTP {e.response.status_code}: {str(e)[:200]}",
        }
    except Exception as e:
        return {
            "url": url,
            "crawl_status": "failed",
            "content": "",
            "error": f"Unexpected error: {str(e)[:200]}",
        }


@router.post("")
async def smart_search(request: SmartSearchRequest):
    """
    Smart search endpoint: LLM query expansion → SearXNG search → Crawl4AI extraction.

    1. Expands the user query into 3 alternatives using Qwen 3.5
    2. Searches all queries concurrently via SearXNG
    3. Deduplicates URLs
    4. Crawls URLs concurrently via Crawl4AI to extract markdown content
    5. Returns combined results as JSON
    """
    # Step 1: LLM query expansion
    expanded_queries = await expand_query_with_llm(request.query)

    # Step 2: Concurrent SearXNG searches
    search_tasks = [
        searxng_search(q, request.num_results, request.language, request.category)
        for q in expanded_queries
    ]
    search_results_list = await asyncio.gather(*search_tasks)

    # Merge and deduplicate by URL
    seen_urls = set()
    unique_results = []
    for results in search_results_list:
        for r in results:
            if r["url"] not in seen_urls:
                seen_urls.add(r["url"])
                unique_results.append(r)

    # Limit to max_urls
    urls_to_crawl = unique_results[:request.max_urls]

    # Step 3: Concurrent Crawl4AI extraction
    crawl_tasks = [crawl_url(r["url"]) for r in urls_to_crawl]
    crawl_results = await asyncio.gather(*crawl_tasks)

    # Step 4: Compile final results
    results = []
    for search_info, crawl_info in zip(urls_to_crawl, crawl_results):
        results.append({
            "title": search_info["title"],
            "url": search_info["url"],
            "source": search_info["source"],
            "content": crawl_info["content"],
            "crawl_status": crawl_info["crawl_status"],
            "error": crawl_info["error"],
        })

    # Stats
    stats = {
        "total_results": len(results),
        "crawled_successfully": sum(1 for r in results if r["crawl_status"] == "success"),
        "blocked_by_captcha": sum(1 for r in results if r["crawl_status"] == "blocked"),
        "other_errors": sum(1 for r in results if r["crawl_status"] in ("failed", "timeout")),
    }

    response_data = {
        "success": True,
        "original_query": request.query,
        "expanded_queries": expanded_queries,
        "results": results,
        "stats": stats,
    }

    return Response(content=json.dumps(response_data, ensure_ascii=False).encode("utf-8"), media_type="application/json")
