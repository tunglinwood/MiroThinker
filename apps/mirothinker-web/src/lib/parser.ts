// Message parser for MiroThinker output format
// Parses thinking blocks, tool calls, and tool results from LLM messages

import type { ParsedMessage, ParsedToolCall } from './types';

export function parseMessageContent(content: string): ParsedMessage {
  let thinking: string | null = null;
  const toolCalls: ParsedToolCall[] = [];
  let text = content;

  // Extract thinking block - handle complete and incomplete (streaming) cases
  const completeThinkMatch = text.match(/<think>([\s\S]*?)<\/think>/gi);
  if (completeThinkMatch) {
    thinking = completeThinkMatch[0].replace(/<\/?think>/gi, '').trim();
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } else {
    const partialThinkMatch = text.match(/<think>([\s\S]*)$/i);
    if (partialThinkMatch) {
      thinking = partialThinkMatch[1].trim();
      text = text.replace(/<think>[\s\S]*$/i, '').trim();
    }
  }

  // Extract complete MCP tool calls: <use_mcp_tool>...</use_mcp_tool>
  const mcpToolRegex =
    /<use_mcp_tool[^>]*>\s*<server_name[^>]*>(.*?)<\/server_name>\s*<tool_name[^>]*>(.*?)<\/tool_name>\s*<arguments[^>]*>\s*([\s\S]*?)\s*<\/arguments>\s*<\/use_mcp_tool>/gi;
  let match: RegExpExecArray | null;
  while ((match = mcpToolRegex.exec(text)) !== null) {
    const serverName = match[1].trim();
    const toolName = match[2].trim();
    const args = match[3].trim();
    toolCalls.push({
      server_name: serverName,
      tool_name: toolName,
      args,
      type: classifyToolType(toolName),
    });
  }
  text = text.replace(/<use_mcp_tool[^>]*>[\s\S]*?<\/use_mcp_tool>/gi, '').trim();

  // Extract incomplete MCP tool calls (streaming/truncated)
  const incompleteMcpRegex =
    /<use_mcp_tool[^>]*>\s*(?:<server_name[^>]*>(.*?)<\/server_name>)?\s*(?:<tool_name[^>]*>(.*?)<\/tool_name>)?\s*(?:<arguments[^>]*>\s*([\s\S]*))?$/gi;
  while ((match = incompleteMcpRegex.exec(text)) !== null) {
    const serverName = match[1]?.trim() || '';
    const toolName = match[2]?.trim() || '';
    const args = match[3]?.trim() || '';
    if (serverName || toolName) {
      toolCalls.push({
        server_name: serverName,
        tool_name: toolName || 'pending...',
        args: args || '(loading...)',
        type: classifyToolType(toolName),
      });
    }
  }
  text = text.replace(/<use_mcp_tool[^>]*>[\s\S]*$/gi, '').trim();

  // Extract tool result blocks: <tool_result>tool_name: result</tool_result>
  const toolResultRegex = /<tool_result>\s*(\w+):\s*([\s\S]*?)<\/tool_result>/gi;
  let resultMatch: RegExpExecArray | null;
  while ((resultMatch = toolResultRegex.exec(text)) !== null) {
    const toolName = resultMatch[1];
    const toolResult = resultMatch[2].trim();
    const existingTool = toolCalls.find(
      (t) => t.tool_name.includes(toolName) || t.server_name.includes(toolName)
    );
    if (existingTool) {
      existingTool.result = toolResult;
    } else {
      toolCalls.push({
        server_name: '',
        tool_name: toolName,
        args: '',
        result: toolResult,
        type: classifyToolType(toolName),
      });
    }
  }
  text = text.replace(/<tool_result>[\s\S]*?<\/tool_result>/gi, '').trim();

  return { thinking, toolCalls, text };
}

function classifyToolType(toolName: string): ParsedToolCall['type'] {
  const name = toolName.toLowerCase();
  if (name.includes('search') || name.includes('searxng') || name.includes('google')) {
    return 'search';
  }
  if (name.includes('python') || name.includes('code') || name.includes('execute') || name.includes('run_')) {
    return 'code';
  }
  if (name.includes('scrape') || name.includes('read') || name.includes('fetch') || name.includes('browse') || name.includes('crawl') || name.includes('markdown')) {
    return 'read';
  }
  if (name.includes('reason')) {
    return 'reasoning';
  }
  return 'default';
}

/** Parse search results from tool output JSON */
export function parseSearchResults(
  output: string | null | undefined
): Array<{ title?: string; link?: string; url?: string; snippet?: string }> | null {
  if (!output) return null;

  // Try parsing the full string first
  try {
    const parsed = JSON.parse(output);
    return extractResultsArray(parsed);
  } catch {
    // Not valid JSON — may be truncated
  }

  const jsonStart = output.indexOf('{');
  if (jsonStart < 0) return null;

  const jsonStr = output.slice(jsonStart);

  // Try closing with various bracket combinations
  const closings = ['}', ']', '}}', ']}'];
  for (const closing of closings) {
    try {
      const truncated = jsonStr.endsWith(closing) ? jsonStr : jsonStr + closing;
      const parsed = JSON.parse(truncated);
      return extractResultsArray(parsed);
    } catch {
      // Try next closing
    }
  }

  // Truncated JSON — try to repair by finding the last complete result object.
  // Strip the incomplete tail after the last `},` or `}]` boundary, then close.
  const lastCompleteIdx = jsonStr.lastIndexOf('},');
  if (lastCompleteIdx > 0) {
    const repaired = jsonStr.slice(0, lastCompleteIdx + 1) + ']}';
    try {
      const parsed = JSON.parse(repaired);
      const results = extractResultsArray(parsed);
      if (results && results.length > 0) return results;
    } catch {
      // Try with just ']' closer
      try {
        const repaired2 = jsonStr.slice(0, lastCompleteIdx + 1) + ']';
        const parsed = JSON.parse(repaired2);
        const results = extractResultsArray(parsed);
        if (results && results.length > 0) return results;
      } catch {
        // Fall through to regex
      }
    }
  }

  // Regex fallback — extract individual {title, link} objects
  const items: Array<{ title?: string; link?: string; url?: string; snippet?: string }> = [];
  // Match full result objects: { ..., "title": "...", "link": "...", ..., "snippet": "...", "source": "..." }
  const objRegex = /\{"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"(?:link|url)"\s*:\s*"((?:[^"\\]|\\.)*)"(?:[^}]*"(?:snippet|source)"\s*:\s*"((?:[^"\\]|\\.)*)")?[^}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(jsonStr)) !== null && items.length < 15) {
    items.push({
      title: m[1],
      link: m[2],
      snippet: m[3] || '',
    });
  }
  if (items.length > 0) return items;

  // Broader regex — title after link, or with escaped quotes
  const broadRegex = /\{[^{}]*"(?:title)"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*"(?:link|url)"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*\}/g;
  let m2: RegExpExecArray | null;
  while ((m2 = broadRegex.exec(jsonStr)) !== null && items.length < 15) {
    items.push({ title: m2[1], link: m2[2] });
  }
  if (items.length > 0) return items;

  return null;
}

function extractResultsArray(parsed: unknown): Array<{ title?: string; link?: string; url?: string; snippet?: string }> | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.organic && Array.isArray(obj.organic)) return obj.organic.slice(0, 15);
  if (obj.organic_results && Array.isArray(obj.organic_results)) return obj.organic_results.slice(0, 15);
  if (obj.results && Array.isArray(obj.results)) return obj.results.slice(0, 15);
  if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0].link || parsed[0].url)) return parsed.slice(0, 15);
  return null;
}

/** Get display metadata for a tool call */
export function getToolDisplay(tool: ParsedToolCall): {
  icon: string;
  action: string;
  detail: string;
  colorClass: string;
  bgClass: string;
} {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(tool.args);
  } catch {
    // Not valid JSON
  }

  switch (tool.type) {
    case 'search': {
      const query = (args.q || args.query || args.search_query || '') as string;
      return {
        icon: 'search',
        action: 'Searching for',
        detail: `"${query}"`,
        colorClass: 'text-blue-400',
        bgClass: 'bg-blue-400/10',
      };
    }
    case 'code': {
      return {
        icon: 'code',
        action: 'Running code',
        detail: '',
        colorClass: 'text-purple-400',
        bgClass: 'bg-purple-400/10',
      };
    }
    case 'read': {
      const url = (args.url || args.webpage_url || '') as string;
      return {
        icon: 'globe',
        action: 'Reading',
        detail: url,
        colorClass: 'text-green-400',
        bgClass: 'bg-green-400/10',
      };
    }
    case 'reasoning': {
      return {
        icon: 'lightbulb',
        action: 'Reasoning',
        detail: '',
        colorClass: 'text-amber-400',
        bgClass: 'bg-amber-400/10',
      };
    }
    default: {
      return {
        icon: 'wrench',
        action: tool.tool_name,
        detail: '',
        colorClass: 'text-text-secondary',
        bgClass: 'bg-surface',
      };
    }
  }
}

/** Format milliseconds to human-readable string */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/** Get duration color class based on milliseconds */
export function getDurationColor(ms: number): string {
  if (ms < 5000) return 'text-green-400';
  if (ms < 30000) return 'text-yellow-400';
  return 'text-red-400';
}

/** Parse and format tool arguments JSON */
export function parseToolArgs(args: string): Record<string, unknown> {
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}
