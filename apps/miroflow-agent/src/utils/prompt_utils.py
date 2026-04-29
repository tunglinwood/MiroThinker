# Copyright (c) 2025 MiroMind
# This source code is licensed under the Apache 2.0 License.

"""
Prompt templates and utilities for agent system prompts.

This module provides:
- System prompt generation for MCP tool usage
- Agent-specific prompt generation (main agent, browsing agent)
- Summary prompt templates for final answer generation
- Failure experience templates for retry mechanisms
"""

# ============================================================================
# Format Error Messages
# ============================================================================

FORMAT_ERROR_MESSAGE = "No \\boxed{} content found in the final answer."

# ============================================================================
# Failure Summary Templates (for format error retry)
# ============================================================================

FAILURE_SUMMARY_PROMPT = """The task was not completed successfully. Do NOT call any tools. Provide a summary:

Failure type: [incomplete / blocked / misdirected / format_missed]
  - incomplete: ran out of turns before finishing
  - blocked: got stuck due to tool failure or missing information
  - misdirected: went down the wrong path
  - format_missed: found the answer but forgot to use \\boxed{}
What happened: [describe the approach taken and why a final answer was not reached]
Useful findings: [list any facts, intermediate results, or conclusions discovered that should be reused]"""

# Assistant prefix for failure summary generation (guides model to follow structured format)
FAILURE_SUMMARY_THINK_CONTENT = """We need to write a structured post-mortem style summary **without calling any tools**, explaining why the task was not completed, using these required sections:

* **Failure type**: pick one from **incomplete / blocked / misdirected / format_missed**
* **What happened**: describe the approach taken and why it didn't reach a final answer
* **Useful findings**: list any facts, intermediate results, or conclusions that can be reused"""

FAILURE_SUMMARY_ASSISTANT_PREFIX = (
    f"<think>\n{FAILURE_SUMMARY_THINK_CONTENT}\n</think>\n\n"
)

# ============================================================================
# MCP Tags for Parsing
# ============================================================================

mcp_tags = [
    "<use_mcp_tool>",
    "</use_mcp_tool>",
    "<server_name>",
    "</server_name>",
    "<arguments>",
    "</arguments>",
]

refusal_keywords = [
    "time constraint",
    "I’m sorry, but I can’t",
    "I'm sorry, I cannot solve",
]


def generate_mcp_system_prompt(date, mcp_servers):
    """
    Generate the MCP (Model Context Protocol) system prompt for LLM.

    Creates a structured prompt that instructs the LLM on how to use available
    MCP tools. Includes tool definitions, XML formatting instructions, and
    general task-solving guidelines.

    Args:
        date: Current date object for timestamp inclusion
        mcp_servers: List of server definitions, each containing 'name' and 'tools'

    Returns:
        Complete system prompt string with tool definitions and usage instructions
    """
    formatted_date = date.strftime("%Y-%m-%d")

    # Start building the template, now follows https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview#tool-use-system-prompt
    template = f"""In this environment you have access to a set of tools you can use to answer the user's question. 

You only have access to the tools provided below. You can only use one tool per message, and will receive the result of that tool in the user's next response. You use tools step-by-step to accomplish a given task, with each tool-use informed by the result of the previous tool-use. Today is: {formatted_date}

# Tool-Use Formatting Instructions 

Tool-use is formatted using XML-style tags. The tool-use is enclosed in <use_mcp_tool></use_mcp_tool> and each parameter is similarly enclosed within its own set of tags.

The Model Context Protocol (MCP) connects to servers that provide additional tools and resources to extend your capabilities. You can use the server's tools via the `use_mcp_tool`.

Description: 
Request to use a tool provided by a MCP server. Each MCP server can provide multiple tools with different capabilities. Tools have defined input schemas that specify required and optional parameters.

Parameters:
- server_name: (required) The name of the MCP server providing the tool
- tool_name: (required) The name of the tool to execute
- arguments: (required) A JSON object containing the tool's input parameters, following the tool's input schema, quotes within string must be properly escaped, ensure it's valid JSON

Usage:
<use_mcp_tool>
<server_name>server name here</server_name>
<tool_name>tool name here</tool_name>
<arguments>
{{
"param1": "value1",
"param2": "value2 \\"escaped string\\""
}}
</arguments>
</use_mcp_tool>

Important Notes:
- Tool-use must be placed **at the end** of your response, **top-level**, and not nested within other tags.
- Always adhere to this format for the tool use to ensure proper parsing and execution.

String and scalar parameters should be specified as is, while lists and objects should use JSON format. Note that spaces for string values are not stripped. The output is not expected to be valid XML and is parsed with regular expressions.
Here are the functions available in JSONSchema format:

"""

    # Add MCP servers section
    if mcp_servers and len(mcp_servers) > 0:
        for server in mcp_servers:
            template += f"\n## Server name: {server['name']}\n"

            if "tools" in server and len(server["tools"]) > 0:
                for tool in server["tools"]:
                    # Skip tools that failed to load (they only have 'error' key)
                    if "error" in tool and "name" not in tool:
                        continue
                    template += f"### Tool name: {tool['name']}\n"
                    template += f"Description: {tool['description']}\n"
                    template += f"Input JSON schema: {tool['schema']}\n"

    # Add the full objective system prompt
    template += """
# General Objective

You accomplish a given task iteratively, breaking it down into clear steps and working through them methodically.

# CRITICAL TOOL USAGE RULES

You MUST use tools when:
1. You don't know the answer or have limited information
2. The question requires current or specific data (prices, dates, events, etc.)
3. You need to verify information from authoritative sources
4. The task requires computation or code execution

When you need to use a tool, you MUST call it - do NOT try to answer from memory alone if you're uncertain.

## Tool-Use Requirement
- If you are unsure about ANY piece of information, you MUST use a search tool (searxng) to find current data
- If you need to browse a web page or URL, use tool-crawl4ai (crawl_page or get_markdown)
- If you need to read a document file (PDF, DOCX, PPTX, XLSX, CSV, ZIP), use tool-reader (convert_to_markdown)
- If you need to run code for calculation or data processing, use microsandbox-docker
- NEVER guess or make up information - always search or browse to verify

## When to Delegate to search_and_browse

Use `search_and_browse` (server: agent-browsing) for complex web research that would require you to perform many individual search + browse cycles. The browsing agent runs its own full interaction loop — it can independently search, read URLs, extract information, and synthesize findings from dozens of sources. You delegate once and get back a consolidated answer.

DELEGATE when:
- The task requires finding information from 5+ different sources or URLs
- You need to compare multiple products, companies, or entities across several dimensions
- The research involves reading and synthesizing content from many web pages
- You would need to perform more than 3-4 individual search/crawl steps to answer

Do NOT delegate when:
- A single searxng search can answer the question
- You only need to scrape one specific URL (use tool-crawl4ai directly)
- The task involves code execution, calculation, or document reading — use dedicated tools

When delegating, be specific about what you need:
- State the research goal clearly
- Include any context or partial information you already know
- Specify what format you want the answer in (table, comparison, summary, etc.)

Available search tools:
- searxng: Local privacy-respecting search engine (use duckduckgo)

# OUTPUT FORMAT

When asked to research a compound, drug, or pharmaceutical molecule, you MUST output your findings in the following JSON format:

{
  "chem_name": "COMPOUND_NAME",
  "company": "Company Name",
  "stage": "Development stage",
  "chemical_identifiers": {
    "pubchem_cid": "PubChem CID or null",
    "smiles": "SMILES or null",
    "inchikey": "InChIKey or null",
    "iupac": "IUPAC name or null",
    "molecular_weight": "MW or null",
    "notes": "Additional notes"
  },
  "clinical_trials": [{"nct": "NCT number", "phase": "Phase", "title": "Title"}],
  "patents": [],
  "pubmed_papers": [{"pmid": "PMID", "title": "Title", "year": "Year"}],
  "suppliers": [],
  "key_findings": "Key findings",
  "data_quality": "complete|partial|none",
  "notes": "Notes"
}

Output ONLY valid JSON in this exact format. Do not include any other text.
"""

    return template


def generate_agent_specific_system_prompt(agent_type=""):
    """
    Generate agent-specific objective prompts based on agent type.

    Different agent types have different objectives:
    - main: Task-solving agent that uses tools to answer questions
    - agent-browsing: Web search and browsing agent for information retrieval

    Args:
        agent_type: Type of agent ("main", "agent-browsing", or "browsing-agent")

    Returns:
        Agent-specific objective prompt string
    """
    if agent_type == "main":
        system_prompt = """\n
# Agent Specific Objective

You are a task-solving agent that uses tools step-by-step to answer the user's question. Your goal is to provide complete, accurate and well-reasoned answers using additional tools.

"""
    elif agent_type == "agent-browsing" or agent_type == "browsing-agent":
        system_prompt = """# Agent Specific Objective

You are an agent that performs the task of searching and browsing the web for specific information and generating the desired answer. Your task is to retrieve reliable, factual, and verifiable information that fills in knowledge gaps.
Do not infer, speculate, summarize broadly, or attempt to fill in missing parts yourself. Only return factual content.
"""
    else:
        raise ValueError(f"Unknown agent type: {agent_type}")
    return system_prompt.strip()


def generate_agent_summarize_prompt(task_description, agent_type="", task_format="auto"):
    """
    Generate the final summarization prompt for an agent.

    Creates prompts that instruct agents to summarize their work and provide
    final answers. Different agent types have different summarization formats:
    - main: Must wrap answer in \\boxed{} with strict formatting rules
    - agent-browsing: Provides structured report of findings
    - research: Provides comprehensive written summary (for research tasks)

    Args:
        task_description: The original task/question to reference in the summary
        agent_type: Type of agent ("main" or "agent-browsing")
        task_format: Format type ("auto", "benchmark", "research")
            - "auto": Auto-detect based on task keywords
            - "benchmark": Strict \\boxed{} format for evaluations
            - "research": Free-form text summary for research tasks (DEFAULT)

    Returns:
        Summarization prompt string with formatting instructions
    """
    # Auto-detect format based on task description keywords - default to research
    if task_format == "auto":
        research_keywords = ["explain", "find", "search", "results", "information", 
                            "what is", "how does", "describe", "summarize", "report",
                            "clinical", "trials", "science", "research", "study"]
        benchmark_keywords = ["calculate", "solve", "compute", "value", "number", "result"]
        
        task_lower = task_description.lower() if task_description else ""
        is_research = any(kw in task_lower for kw in research_keywords)
        is_benchmark = any(kw in task_lower for kw in benchmark_keywords)
        
        # Default to research for most tasks
        if is_benchmark and not is_research:
            task_format = "benchmark"
        else:
            task_format = "research"
    
    if agent_type == "main" and task_format == "research":
        # Research task prompt - allows free-form text summary
        summarize_prompt = (
            "You have completed the research task. Provide a comprehensive summary of your findings.\n\n"
            f"Original Question: {task_description}\n\n"
            "Based on the information gathered during your research, provide a clear, well-structured summary that includes:\n"
            "1. Key findings and main results\n"
            "2. Important data, statistics, or figures (if applicable)\n"
            "3. Any conclusions or insights\n"
            "4. Sources or references (if found)\n\n"
            "Write your response in clear, professional language suitable for a research report.\n"
            "Do NOT use \\boxed{} format - provide a natural text summary.\n"
            "If the task was to find specific information, include all relevant details found.\n"
            "If you could not find complete information, indicate what was found and any gaps.\n"
            "Do NOT make up information that was not found in your research.\n\n"
            "Provide your final summary now."
        )
    elif agent_type == "main" and task_format == "benchmark":
        summarize_prompt = (
            "Summarize the above conversation, and output the FINAL ANSWER to the original question.\n\n"
            "If a clear answer has already been provided earlier in the conversation, do not rethink or recalculate it — "
            "simply extract that answer and reformat it to match the required format below.\n"
            "If a definitive answer could not be determined, make a well-informed educated guess based on the conversation.\n\n"
            "The original question is repeated here for reference:\n\n"
            f'"{task_description}"\n\n'
            "Wrap your final answer in \\boxed{}.\n"
            "Your final answer should be:\n"
            "- a number, OR\n"
            "- as few words as possible, OR\n"
            "- a comma-separated list of numbers and/or strings.\n\n"
            "ADDITIONALLY, your final answer MUST strictly follow any formatting instructions in the original question — "
            "such as alphabetization, sequencing, units, rounding, decimal places, etc.\n"
            "If you are asked for a number, express it numerically (i.e., with digits rather than words), don't use commas, and DO NOT INCLUDE UNITS such as $ or USD or percent signs unless specified otherwise.\n"
            "If you are asked for a string, don't use articles or abbreviations (e.g. for cities), unless specified otherwise. Don't output any final sentence punctuation such as '.', '!', or '?'.\n"
            "If you are asked for a comma-separated list, apply the above rules depending on whether the elements are numbers or strings.\n"
            "Do NOT include any punctuation such as '.', '!', or '?' at the end of the answer.\n"
            "Do NOT include any invisible or non-printable characters in the answer output.\n\n"
            "You must absolutely not perform any MCP tool call, tool invocation, search, scrape, code execution, or similar actions.\n"
            "You can only answer the original question based on the information already retrieved and your own internal knowledge.\n"
            "If you attempt to call any tool, it will be considered a mistake."
        )
    elif agent_type == "agent-browsing":
        summarize_prompt = (
            "This is a direct instruction to you (the assistant), not the result of a tool call.\n\n"
            "We are now ending this session, and your conversation history will be deleted. "
            "You must NOT initiate any further tool use. This is your final opportunity to report "
            "*all* of the information gathered during the session.\n\n"
            "The original task is repeated here for reference:\n\n"
            f'"{task_description}"\n\n'
            "Summarize the above search and browsing history. Output the FINAL RESPONSE and detailed supporting information of the task given to you.\n\n"
            "If you found any useful facts, data, quotes, or answers directly relevant to the original task, include them clearly and completely.\n"
            "If you reached a conclusion or answer, include it as part of the response.\n"
            "If the task could not be fully answered, do NOT make up any content. Instead, return all partially relevant findings, "
            "Search results, quotes, and observations that might help a downstream agent solve the problem.\n"
            "If partial, conflicting, or inconclusive information was found, clearly indicate this in your response.\n\n"
            "Your final response should be a clear, complete, and structured report.\n"
            "Organize the content into logical sections with appropriate headings.\n"
            "Do NOT include any tool call instructions, speculative filler, or vague summaries.\n"
            "Focus on factual, specific, and well-organized information."
        )
    else:
        raise ValueError(f"Unknown agent type: {agent_type}")

    return summarize_prompt.strip()
