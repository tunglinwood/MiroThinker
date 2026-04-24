'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  MessageSquare,
  Cpu,
  Server,
  Hash,
} from 'lucide-react';
import type { TaskTelemetry } from '@/lib/types';
import { formatDuration } from '@/lib/parser';

interface TaskOverviewProps {
  telemetry: TaskTelemetry;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatDurationSec(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function ContextProgressBar({ current, limit }: { current: number; limit: number }) {
  const pct = Math.min((current / limit) * 100, 100);
  const color = pct > 80 ? 'bg-red-400' : pct > 60 ? 'bg-yellow-400' : 'bg-green-400';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-text-muted">Context</span>
        <span className="text-text-secondary">{formatTokens(current)} / {formatTokens(limit)}</span>
      </div>
      <div className="h-2 bg-background rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function TaskOverview({ telemetry }: TaskOverviewProps) {
  const [showEnv, setShowEnv] = useState(false);

  const {
    total_input_tokens,
    total_output_tokens,
    context_limit,
    turns,
    duration_seconds,
    tool_usage_summary,
    env_info,
    start_time,
    end_time,
  } = telemetry;

  const lastTurn = turns[turns.length - 1];
  const finalContext = lastTurn?.context_tokens || 0;

  const toolEntries = Object.entries(tool_usage_summary).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Clock className="w-3.5 h-3.5" />
            Duration
          </div>
          <p className="text-lg font-semibold text-text-primary">{formatDurationSec(duration_seconds)}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Layers className="w-3.5 h-3.5" />
            Turns
          </div>
          <p className="text-lg font-semibold text-text-primary">{turns.length}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <MessageSquare className="w-3.5 h-3.5" />
            Input Tokens
          </div>
          <p className="text-lg font-semibold text-text-primary">{formatTokens(total_input_tokens)}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Cpu className="w-3.5 h-3.5" />
            Output Tokens
          </div>
          <p className="text-lg font-semibold text-text-primary">{formatTokens(total_output_tokens)}</p>
        </div>
      </div>

      {/* Context progress + Tool usage */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <ContextProgressBar current={finalContext} limit={context_limit} />
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs font-medium text-text-muted mb-2 flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" />
            Tool Usage
          </p>
          <div className="flex flex-wrap gap-1.5">
            {toolEntries.map(([name, count]) => (
              <span
                key={name}
                className="text-xs px-2 py-1 bg-background border border-border rounded-full text-text-secondary"
              >
                {name}: {count}
              </span>
            ))}
            {toolEntries.length === 0 && (
              <span className="text-xs text-text-muted">No tools used</span>
            )}
          </div>
        </div>
      </div>

      {/* Token usage per turn — mini bar chart */}
      {turns.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs font-medium text-text-muted mb-3">Token Usage by Turn</p>
          <div className="space-y-2">
            {turns.map((turn) => {
              const maxInput = Math.max(...turns.map((t) => t.input_tokens), 1);
              const inputPct = (turn.input_tokens / maxInput) * 100;
              const outputPct = (turn.output_tokens / Math.max(...turns.map((t) => t.output_tokens), 1)) * 100;

              return (
                <div key={turn.turn} className="flex items-center gap-2 text-xs">
                  <span className="w-10 text-text-muted font-mono">T{turn.turn}</span>
                  <div className="flex-1 flex gap-1">
                    <div
                      className="h-3 bg-blue-400/40 rounded-sm transition-all"
                      style={{ width: `${inputPct}%` }}
                      title={`Input: ${formatTokens(turn.input_tokens)}`}
                    />
                    <div
                      className="h-3 bg-purple-400/40 rounded-sm transition-all"
                      style={{ width: `${outputPct}%` }}
                      title={`Output: ${formatTokens(turn.output_tokens)}`}
                    />
                  </div>
                  <span className="w-16 text-right text-text-muted font-mono">
                    {formatTokens(turn.input_tokens)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-blue-400/40 inline-block" />
              Input
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-purple-400/40 inline-block" />
              Output
            </span>
          </div>
        </div>
      )}

      {/* Environment info — collapsible */}
      <div className="bg-surface border border-border rounded-xl">
        <button
          onClick={() => setShowEnv(!showEnv)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm"
        >
          <span className="flex items-center gap-2 text-text-muted">
            <Server className="w-3.5 h-3.5" />
            Environment
          </span>
          {showEnv ? (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-muted" />
          )}
        </button>
        {showEnv && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {Object.entries(env_info).map(([key, value]) => {
                if (value === null || value === undefined) return null;
                const displayValue = typeof value === 'boolean'
                  ? (value ? 'Yes' : 'No')
                  : String(value);
                return (
                  <div key={key} className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-text-muted">{key}</span>
                    <span className="text-text-secondary font-mono truncate ml-2">{displayValue}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
