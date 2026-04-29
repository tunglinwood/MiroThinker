'use client';

import { Loader2, Hash, Brain } from 'lucide-react';
import type { SseToolCall } from '@/lib/types';
import { SearchResultsView } from './search-results-view';
import { PythonCodeOutput } from './python-code-output';
import { IntermediateSteps } from './intermediate-steps';

interface ToolRendererProps {
  toolCall: SseToolCall;
}

export function ToolRenderer({ toolCall }: ToolRendererProps) {
  const tc = toolCall;
  const name = tc.tool_name.toLowerCase();
  const server = tc.server_name.toLowerCase();

  // Search results
  if (name.includes('searxng') || (name.includes('search') && server.includes('searxng'))) {
    const query = typeof tc.input?.q === 'string' ? tc.input.q : '';
    const engines = typeof tc.input?.category === 'string' ? tc.input.category : undefined;
    if (tc.result) {
      return (
        <SearchResultsView
          key={tc.tool_call_id}
          query={query || tc.tool_name}
          rawResult={tc.result}
          engines={engines}
        />
      );
    }
    return (
      <div key={tc.tool_call_id} className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-400/10 border border-blue-400/20 flex items-center justify-center flex-shrink-0">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
        </div>
        <div className="flex-1">
          <span className="text-sm font-medium text-blue-400">Searching</span>
          {query && <span className="text-xs text-text-muted ml-2">"{query}"</span>}
        </div>
      </div>
    );
  }

  // Python / code execution
  if (name.includes('python') || name.includes('run_python') || server.includes('microsandbox') || server.includes('sandbox')) {
    const code = typeof tc.input?.code === 'string' ? tc.input.code : '';
    const output = tc.result || '';
    return (
      <PythonCodeOutput
        key={tc.tool_call_id}
        code={code}
        output={output}
        status={tc.status}
      />
    );
  }

  // show_text — intermediate step info
  if (name.includes('show_text') || name.includes('show_message') || name === 'print') {
    return (
      <IntermediateSteps
        key={tc.tool_call_id}
        steps={[{ text: tc.result || JSON.stringify(tc.input) || tc.tool_name, type: 'info' }]}
      />
    );
  }

  // Crawl / read page
  if (name.includes('crawl') || name.includes('scrape') || name.includes('fetch') || name.includes('browse')) {
    const url = typeof tc.input?.url === 'string' ? tc.input.url : '';
    return (
      <div key={tc.tool_call_id} className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-green-400/10 border border-green-400/20 flex items-center justify-center flex-shrink-0">
          <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
        </div>
        <div className="flex-1">
          <span className="text-sm font-medium text-green-400">Reading page</span>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-text-muted ml-2 hover:text-accent truncate block">
              {url}
            </a>
          )}
          {tc.result && (
            <pre className="text-xs text-text-secondary mt-1 whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto">
              {tc.result.length > 500 ? `${tc.result.slice(0, 500)}...` : tc.result}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // Reasoning
  if (name.includes('reason')) {
    return (
      <div key={tc.tool_call_id} className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center flex-shrink-0">
          <Brain className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1">
          <span className="text-sm font-medium text-amber-400">Reasoning</span>
          {tc.result && (
            <pre className="text-xs text-text-secondary mt-1 whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto">
              {tc.result.length > 500 ? `${tc.result.slice(0, 500)}...` : tc.result}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // Default / unknown tool
  return (
    <div key={tc.tool_call_id} className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center flex-shrink-0">
        <Hash className="w-4 h-4 text-text-muted" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-secondary">{tc.tool_name}</span>
          <span className="text-xs text-text-muted">{tc.server_name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            tc.status === 'completed' ? 'bg-green-400/10 text-green-400' :
            tc.status === 'running' ? 'bg-yellow-400/10 text-yellow-400' :
            tc.status === 'error' ? 'bg-red-400/10 text-red-400' :
            'bg-text-muted/10 text-text-muted'
          }`}>{tc.status}</span>
        </div>
        {tc.result && (
          <pre className="text-xs text-text-secondary mt-1 whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto">
            {tc.result.length > 500 ? `${tc.result.slice(0, 500)}...` : tc.result}
          </pre>
        )}
      </div>
    </div>
  );
}
