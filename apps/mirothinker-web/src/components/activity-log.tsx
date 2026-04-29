'use client';

import { useState } from 'react';
import { Filter, MessageSquare, Hash, CheckCircle, Loader2, Bot } from 'lucide-react';
import type { LogEntry } from '@/lib/types';

interface ActivityLogProps {
  logs: LogEntry[];
}

type LogFilter = 'all' | 'retention' | 'context' | 'status' | 'tool' | 'sub_agent';

const filterIcons: Record<LogFilter, typeof Filter> = {
  all: Filter,
  retention: MessageSquare,
  context: Hash,
  status: CheckCircle,
  tool: Loader2,
  sub_agent: Bot,
};

const filterLabels: Record<LogFilter, string> = {
  all: 'All',
  retention: 'Retention',
  context: 'Context',
  status: 'Status',
  tool: 'Tools',
  sub_agent: 'Sub-agents',
};

function classifyLogType(log: LogEntry): LogFilter {
  // Prefer the explicit type set by the frontend
  if (log.type === 'retention') return 'retention';
  if (log.type === 'context') return 'context';
  if (log.type === 'status') return 'status';
  if (log.type === 'tool_call' && log.sub_agent_name) return 'sub_agent';
  if (log.type === 'tool_call') return 'tool';

  // Fallback: classify based on content
  const input = (log.input || '').toLowerCase();
  const output = (log.output || '').toLowerCase();
  const combined = input + output;

  if (combined.includes('retention') || combined.includes('keeping')) return 'retention';
  if (combined.includes('context') || combined.includes('limit') || /\d+\/\d+/.test(combined)) return 'context';
  if (combined.includes('stop') || combined.includes('completed') || combined.includes('finished')) return 'status';
  return 'tool';
}

export function ActivityLog({ logs }: ActivityLogProps) {
  const [filter, setFilter] = useState<LogFilter>('all');

  if (logs.length === 0) return null;

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter((log) => classifyLogType(log) === filter);

  return (
    <div className="bg-surface border border-border rounded-xl">
      {/* Header + filter */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-sm font-medium text-text-muted">Activity Log</span>
        <div className="flex items-center gap-1">
          {(Object.keys(filterLabels) as LogFilter[]).map((f) => {
            const Icon = filterIcons[f];
            const isActive = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{filterLabels[f]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Log entries */}
      <div className="p-3 space-y-1.5">
        {filteredLogs.length === 0 && (
          <p className="text-xs text-text-muted text-center py-4">No {filter} events</p>
        )}
        {filteredLogs.map((log, i) => {
          const type = classifyLogType(log);
          const displayText = getLogDisplay(log);

          return (
            <div
              key={i}
              className="flex items-start gap-2 px-2.5 py-2 bg-background rounded-lg text-xs border border-border/50"
            >
              <span className={`mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${
                type === 'retention' ? 'bg-blue-400' :
                type === 'context' ? 'bg-yellow-400' :
                type === 'status' ? 'bg-green-400' :
                type === 'sub_agent' ? 'bg-purple-400' :
                'bg-text-muted'
              }`} />
              <div className="flex-1 min-w-0">
                {type === 'sub_agent' && log.tool_name ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-purple-400 font-medium">{log.sub_agent_name}</span>
                      <span className="text-text-muted">/</span>
                      <span className="text-text-secondary break-words">{log.tool_name}</span>
                    </div>
                    {log.output && (
                      <p className="text-text-muted break-words">{log.output}</p>
                    )}
                  </div>
                ) : type === 'tool' && log.tool_name ? (
                  <p className="text-text-secondary break-words">
                    {log.server_name ? `${log.server_name}/` : ''}{log.tool_name}
                  </p>
                ) : (
                  <p className="text-text-secondary break-words">{displayText}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getLogDisplay(log: LogEntry): string {
  const input = log.input || '';
  if (!input) return log.type || 'Unknown';

  // For backend-format logs, input is "step_name: message"
  const colonIdx = input.indexOf(': ');
  if (colonIdx > 0) {
    const stepName = input.slice(0, colonIdx);
    const message = input.slice(colonIdx + 2);

    // Show only the meaningful part, stripping emoji prefixes
    const cleanStep = stepName.replace(/[\u{1F300}-\u{1F9FF}]\u{FE0F}?/gu, '').trim();

    // For retention entries, show full message
    if (log.type === 'retention') {
      return `${cleanStep}: ${message}`;
    }
    return `${cleanStep}: ${message}`;
  }

  // Fallback: show input directly
  return input;
}
