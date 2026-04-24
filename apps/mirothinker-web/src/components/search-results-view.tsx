'use client';

import { Search, ExternalLink, Globe } from 'lucide-react';
import type { SearchResultItem } from '@/lib/types';

interface SearchResultsViewProps {
  query: string;
  rawResult: string;
  engines?: string;
}

interface EngineGroup {
  name: string;
  results: SearchResultItem[];
}

function parseSearxngResults(raw: string): { engines: string; results: SearchResultItem[] } {
  try {
    const parsed = JSON.parse(raw);
    const results: SearchResultItem[] = [];

    // Handle nested result arrays
    const resultArray = parsed.results || parsed.organic || parsed.organic_results || parsed;
    if (Array.isArray(resultArray)) {
      for (const item of resultArray) {
        if (item.title || item.link || item.url || item.snippet) {
          results.push({
            title: item.title,
            link: item.link || item.url,
            url: item.url || item.link,
            snippet: item.snippet,
            source: item.source || item.engine,
          });
        }
      }
    }

    return {
      engines: parsed.engines || '',
      results,
    };
  } catch {
    return { engines: '', results: [] };
  }
}

function groupByEngine(results: SearchResultItem[]): EngineGroup[] {
  const groups = new Map<string, SearchResultItem[]>();
  for (const result of results) {
    const engine = result.source || 'unknown';
    if (!groups.has(engine)) groups.set(engine, []);
    groups.get(engine)!.push(result);
  }
  return Array.from(groups.entries()).map(([name, items]) => ({ name, results: items }));
}

function getEngineIcon(engine: string): typeof Globe {
  const name = engine.toLowerCase();
  if (name.includes('brave')) return Globe;
  if (name.includes('duckduckgo')) return Globe;
  if (name.includes('bing')) return Globe;
  if (name.includes('google')) return Globe;
  return Globe;
}

export function SearchResultsView({ query, rawResult, engines }: SearchResultsViewProps) {
  const { engines: detectedEngines, results } = parseSearxngResults(rawResult);
  const engineGroups = groupByEngine(results);
  const engineList = engines || detectedEngines;
  const engineNames = engineList ? engineList.split(',').filter(Boolean) : [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-400/10 border border-blue-400/20 flex items-center justify-center flex-shrink-0">
          <Search className="w-4 h-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-blue-400">Searching</span>
            <span className="text-xs text-text-muted truncate">"{query}"</span>
          </div>
          {engineNames.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mb-2">
              {engineNames.map((engine) => {
                const Icon = getEngineIcon(engine);
                return (
                  <span
                    key={engine}
                    className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-400/10 text-blue-300 rounded text-[10px]"
                  >
                    <Icon className="w-2.5 h-2.5" />
                    {engine}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Results — always visible */}
      {results.length > 0 && (
        <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
          {engineGroups.map((group) => {
            const Icon = getEngineIcon(group.name);
            return (
              <div key={group.name} className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
                  <Icon className="w-3 h-3" />
                  {group.name} ({group.results.length})
                </div>
                <div className="space-y-2 pl-4">
                  {group.results.map((result, i) => (
                    <div
                      key={i}
                      className="p-2.5 bg-background rounded-lg border border-border/50 hover:border-border transition-colors"
                    >
                      {result.link || result.url ? (
                        <a
                          href={result.link || result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-accent hover:underline flex items-start gap-1.5"
                        >
                          <span className="flex-1">{result.title || result.link || result.url}</span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        </a>
                      ) : (
                        <p className="text-sm font-medium text-text-primary">{result.title}</p>
                      )}
                      {result.snippet && (
                        <p className="text-xs text-text-secondary mt-1 line-clamp-2">{result.snippet}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No results */}
      {results.length === 0 && rawResult && (
        <div className="pl-11">
          <pre className="text-xs text-text-secondary whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto bg-background rounded-lg p-2 border border-border/50">
            {rawResult.length > 1000 ? `${rawResult.slice(0, 1000)}...` : rawResult}
          </pre>
        </div>
      )}
    </div>
  );
}
