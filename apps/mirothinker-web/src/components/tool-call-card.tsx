'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Clock, Search, Code, Globe, Lightbulb, Wrench, ExternalLink } from 'lucide-react';
import { formatDuration, getDurationColor, parseSearchResults } from '@/lib/parser';
import type { ToolCallTelemetry } from '@/lib/types';

interface ToolCallCardProps {
  toolCall: ToolCallTelemetry;
  index?: number;
}

const iconMap: Record<string, typeof Search> = {
  search: Search,
  code: Code,
  globe: Globe,
  read: Globe,
  reasoning: Lightbulb,
  default: Wrench,
};

function classifyToolType(toolName: string): string {
  const name = toolName.toLowerCase();
  if (name.includes('search') || name.includes('searxng') || name.includes('google')) return 'search';
  if (name.includes('python') || name.includes('code') || name.includes('execute') || name.includes('run_')) return 'code';
  if (name.includes('scrape') || name.includes('read') || name.includes('fetch') || name.includes('browse') || name.includes('crawl')) return 'read';
  if (name.includes('reason')) return 'reasoning';
  return 'default';
}

function getToolTypeInfo(toolName: string): { icon: typeof Search; colorClass: string; bgClass: string; label: string; detail: string } {
  const type = classifyToolType(toolName);
  const Icon = iconMap[type] || Wrench;

  switch (type) {
    case 'search':
      return {
        icon: Icon,
        colorClass: 'text-blue-400',
        bgClass: 'bg-blue-400/10 border-blue-400/20',
        label: 'Searching',
        detail: '',
      };
    case 'code':
      return {
        icon: Icon,
        colorClass: 'text-purple-400',
        bgClass: 'bg-purple-400/10 border-purple-400/20',
        label: 'Running code',
        detail: '',
      };
    case 'read':
      return {
        icon: Icon,
        colorClass: 'text-green-400',
        bgClass: 'bg-green-400/10 border-green-400/20',
        label: 'Reading',
        detail: '',
      };
    case 'reasoning':
      return {
        icon: Icon,
        colorClass: 'text-amber-400',
        bgClass: 'bg-amber-400/10 border-amber-400/20',
        label: 'Reasoning',
        detail: '',
      };
    default:
      return {
        icon: Icon,
        colorClass: 'text-text-secondary',
        bgClass: 'bg-surface border-border',
        label: toolName,
        detail: '',
      };
  }
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return '';
  }
}

function SearchResultChips({ results }: { results: Array<{ title?: string; link?: string; url?: string; snippet?: string }> }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <Search className="w-3 h-3" />
        <span>Found {results.length} results</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {results.slice(0, 15).map((result, idx) => {
          const resultUrl = result.link || result.url || '';
          const faviconUrl = getFaviconUrl(resultUrl);
          return (
            <a
              key={idx}
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-full items-center gap-2 rounded-[16px] bg-background px-2 py-1.5 text-sm text-text-muted hover:bg-background-secondary transition-colors"
              title={result.snippet || result.title}
            >
              {faviconUrl ? (
                <img src={faviconUrl} alt="" className="h-4 w-4 rounded-full bg-surface shadow-sm flex-shrink-0" onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }} />
              ) : (
                <Globe className="h-4 w-4 text-text-muted flex-shrink-0" />
              )}
              <span className="truncate flex-1">{result.title || resultUrl}</span>
              <ExternalLink className="w-3 h-3 text-text-muted flex-shrink-0" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function ToolCallCard({ toolCall, index = 0 }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { icon: Icon, colorClass, bgClass, label } = getToolTypeInfo(toolCall.tool_name);
  const durationColor = getDurationColor(toolCall.duration_ms);

  const searchResults = useMemo(() => parseSearchResults(toolCall.result_preview), [toolCall.result_preview]);
  const hasResults = searchResults && searchResults.length > 0;
  const isSearch = classifyToolType(toolCall.tool_name) === 'search';

  const argsKeys = Object.keys(toolCall.arguments);
  const primaryArg = toolCall.arguments.q || toolCall.arguments.url || toolCall.arguments.code || '';

  return (
    <div className="flex items-start gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${bgClass} border`}>
        <Icon className={`w-4 h-4 ${colorClass}`} />
      </div>
      <div className="flex-1">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${bgClass}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${colorClass}`} />
              <span className={`text-sm font-medium ${colorClass}`}>{label}</span>
              {primaryArg && (
                <span className="text-xs text-text-muted truncate max-w-[200px]">
                  {typeof primaryArg === 'string' ? `"${primaryArg}"` : JSON.stringify(primaryArg)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Duration badge */}
              <span className={`flex items-center gap-1 text-xs ${durationColor} bg-black/20 px-2 py-0.5 rounded-full`}>
                <Clock className="w-3 h-3" />
                {formatDuration(toolCall.duration_ms)}
              </span>
              {expanded ? (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              )}
            </div>
          </div>
        </button>

        {/* Search results — always shown inline when expanded, no extra click needed */}
        {expanded && isSearch && hasResults && (
          <div className="mt-3">
            <SearchResultChips results={searchResults} />
          </div>
        )}

        {/* Expanded content for non-search tools or extra details */}
        {expanded && !isSearch && (
          <div className="mt-2 space-y-3">
            {/* Arguments */}
            {argsKeys.length > 0 && (
              <div className="bg-surface border border-border rounded-xl p-3">
                <p className="text-xs font-medium text-text-muted mb-2">Arguments</p>
                <pre className="text-xs text-text-secondary whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify(toolCall.arguments, null, 2)}
                </pre>
              </div>
            )}

            {/* Result preview */}
            {toolCall.result_preview && (
              <div className="bg-surface border border-border rounded-xl p-3">
                <p className="text-xs font-medium text-text-muted mb-2">Result</p>
                <pre className="text-xs text-text-secondary whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                  {toolCall.result_preview.length > 1500
                    ? `${toolCall.result_preview.slice(0, 1500)}...`
                    : toolCall.result_preview}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* For search tools: show details button for raw JSON/args */}
        {expanded && isSearch && (
          <div className="mt-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
            {showDetails && (
              <div className="mt-2 space-y-3">
                {argsKeys.length > 0 && (
                  <div className="bg-surface border border-border rounded-xl p-3">
                    <p className="text-xs font-medium text-text-muted mb-2">Arguments</p>
                    <pre className="text-xs text-text-secondary whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(toolCall.arguments, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
