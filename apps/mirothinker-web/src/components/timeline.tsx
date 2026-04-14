'use client';

import { useState } from 'react';
import {
  Brain,
  Wrench,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  Code,
  Globe,
  Lightbulb,
} from 'lucide-react';
import type { Message } from '@/lib/types';
import { parseMessageContent, getToolDisplay } from '@/lib/parser';

interface TimelineProps {
  status: string;
  messages: Message[];
  logs: unknown[];
  stepCount: number;
}

const iconMap: Record<string, typeof Search> = {
  search: Search,
  code: Code,
  globe: Globe,
  lightbulb: Lightbulb,
  wrench: Wrench,
};

export function Timeline({ status, messages, logs }: TimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  if (messages.length === 0 && logs.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 py-8 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin text-accent" />
        <span className="text-sm">Agent is thinking...</span>
      </div>
    );
  }

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Build timeline from messages
  const items = messages.map((msg, idx) => {
    const parsed = parseMessageContent(msg.content);
    return {
      index: idx,
      role: msg.role,
      parsed,
      isAssistant: msg.role === 'assistant',
    };
  });

  return (
    <div className="space-y-4">
      {/* Step count badge */}
      {messages.length > 0 && (
        <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
          <span>{messages.length} turn{messages.length !== 1 ? 's' : ''}</span>
          <span>&middot;</span>
          <span>{logs.length} tool call{logs.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Timeline items */}
      {items.map((item) => (
        <div key={item.index} className="space-y-3">
          {/* Thinking block */}
          {item.parsed.thinking && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Brain className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1 bg-accent/5 border border-accent/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-accent">Thinking</span>
                  {status === 'running' && item.index === items.length - 1 && (
                    <Loader2 className="w-3 h-3 animate-spin text-accent" />
                  )}
                </div>
                <pre className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {item.parsed.thinking}
                </pre>
              </div>
            </div>
          )}

          {/* Tool calls */}
          {item.parsed.toolCalls.map((tool, toolIdx) => {
            const display = getToolDisplay(tool);
            const stepKey = `${item.index}-tool-${toolIdx}`;
            const isExpanded = expandedSteps.has(item.index * 100 + toolIdx);
            const IconComponent = iconMap[display.icon] || Wrench;

            return (
              <div key={stepKey} className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${display.bgClass}`}
                >
                  <IconComponent className={`w-4 h-4 ${display.colorClass}`} />
                </div>
                <div className="flex-1">
                  {/* Tool header - clickable */}
                  <button
                    onClick={() => toggleStep(item.index * 100 + toolIdx)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${display.bgClass}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IconComponent className={`w-4 h-4 ${display.colorClass}`} />
                        <span className={`text-sm font-medium ${display.colorClass}`}>
                          {display.action}
                        </span>
                        <span className="text-xs text-text-muted">
                          {tool.server_name}/{tool.tool_name}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-text-muted" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-text-muted" />
                      )}
                    </div>
                    {display.detail && (
                      <p className="text-xs text-text-muted mt-1 truncate">
                        {display.detail}
                      </p>
                    )}
                  </button>

                  {/* Expanded tool result */}
                  {isExpanded && tool.result && (
                    <div className="mt-2 bg-surface border border-border rounded-xl p-4">
                      <p className="text-xs font-medium text-text-muted mb-2">Result</p>
                      <pre className="text-xs text-text-secondary whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
                        {tool.result.length > 2000
                          ? `${tool.result.slice(0, 2000)}...`
                          : tool.result}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Assistant text (non-tool response) */}
          {item.parsed.text && item.isAssistant && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center flex-shrink-0 mt-1 text-sm font-medium">
                A
              </div>
              <div className="flex-1 bg-surface border border-border rounded-xl px-4 py-3">
                <p className="text-text-primary whitespace-pre-wrap leading-relaxed">
                  {item.parsed.text}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Log entries from SSE */}
      {logs.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium text-text-muted mb-3">Recent Activity</p>
          <div className="space-y-2">
            {(logs as Array<Record<string, unknown>>).slice(-10).map((log, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg text-xs"
              >
                <Wrench className="w-3 h-3 text-text-muted flex-shrink-0" />
                <span className="text-text-secondary">
                  {log.type === 'tool_call'
                    ? `${String(log.server_name || '')}/${String(log.tool_name || '')}`
                    : String(log.type || '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
