'use client';

import { useState } from 'react';
import { Code, ChevronDown, ChevronRight } from 'lucide-react';

interface PythonCodeOutputProps {
  code: string;
  output: string;
  status?: 'pending' | 'running' | 'completed' | 'error';
}

/** Strip common HTML wrapper patterns to get raw output */
function stripHtmlWrapper(html: string): { stripped: boolean; content: string } {
  // Check if it's HTML-wrapped output (e.g., from sandbox execution)
  if (html.startsWith('<') && (html.includes('<pre>') || html.includes('<code>') || html.includes('<body>'))) {
    // Extract text content from pre/code blocks
    let content = html;
    content = content.replace(/<[^>]+>/g, '');
    content = content.trim();
    if (content) {
      return { stripped: true, content };
    }
  }
  return { stripped: false, content: html };
}

/** Detect if output contains matplotlib/plot images as base64 */
function extractCharts(output: string): string[] {
  const charts: string[] = [];
  const base64ImgRegex = /<img[^>]*src="data:image\/(?:png|jpeg|gif);base64,([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = base64ImgRegex.exec(output)) !== null) {
    charts.push(`data:image/png;base64,${match[1]}`);
  }
  return charts;
}

export function PythonCodeOutput({ code, output, status = 'completed' }: PythonCodeOutputProps) {
  const [showCode, setShowCode] = useState(false);
  const { stripped, content } = stripHtmlWrapper(output);
  const charts = extractCharts(output);
  const hasOutput = content && content !== 'None' && content !== 'null' && content.trim().length > 0;
  const hasCharts = charts.length > 0;

  const statusColors: Record<string, string> = {
    completed: 'text-green-400',
    running: 'text-yellow-400',
    error: 'text-red-400',
    pending: 'text-text-muted',
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-400/10 border border-purple-400/20 flex items-center justify-center flex-shrink-0">
          <Code className="w-4 h-4 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-purple-400">Running code</span>
            <span className={`text-xs ${statusColors[status]}`}>{status}</span>
          </div>
        </div>
        {code && (
          <button
            onClick={() => setShowCode(!showCode)}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            {showCode ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {showCode ? 'Hide' : 'Show'} code
          </button>
        )}
      </div>

      {/* Source code */}
      {showCode && code && (
        <div className="ml-11 bg-background rounded-lg border border-border/50 p-3">
          <p className="text-[10px] text-text-muted mb-1.5 font-medium uppercase tracking-wide">Code</p>
          <pre className="text-xs text-text-secondary whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
            {code.length > 2000 ? `${code.slice(0, 2000)}...` : code}
          </pre>
        </div>
      )}

      {/* Output */}
      {hasOutput && (
        <div className="ml-11 bg-background rounded-lg border border-border/50 p-3">
          <p className="text-[10px] text-text-muted mb-1.5 font-medium uppercase tracking-wide">Output</p>
          <pre className="text-xs text-text-secondary whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto">
            {content.length > 3000 ? `${content.slice(0, 3000)}...` : content}
          </pre>
        </div>
      )}

      {/* Charts */}
      {hasCharts && (
        <div className="ml-11 space-y-2">
          <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide">Charts</p>
          {charts.map((chart, i) => (
            <img
              key={i}
              src={chart}
              alt={`Chart ${i + 1}`}
              className="max-w-full rounded-lg border border-border/50 bg-background"
            />
          ))}
        </div>
      )}

      {/* Empty output */}
      {!hasOutput && !hasCharts && status === 'completed' && (
        <div className="ml-11 text-xs text-text-muted">No output</div>
      )}
    </div>
  );
}
