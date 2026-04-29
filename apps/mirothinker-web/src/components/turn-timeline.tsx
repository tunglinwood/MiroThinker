'use client';

import { useState, useMemo } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Loader2,
  Hash,
  Cpu,
  Bot,
} from 'lucide-react';
import type { Message, SseToolCall, ToolCallTelemetry, SubAgentState } from '@/lib/types';
import { parseMessageContent } from '@/lib/parser';
import { simpleMarkdownToHtml } from '@/lib/markdown';
import { SearchResultsView } from './search-results-view';
import { PythonCodeOutput } from './python-code-output';
import { IntermediateSteps } from './intermediate-steps';
import { ToolCallCard } from './tool-call-card';
import { ToolRenderer } from './tool-renderer';

interface TurnData {
  turn: number;
  messages: Message[];
  toolCalls: Array<SseToolCall | ToolCallTelemetry>;
  input_tokens: number;
  output_tokens: number;
  context_tokens: number;
  context_limit: number;
}

interface TurnTimelineProps {
  status: string;
  messages: Message[];
  turns: TurnData[];
  stepCount: number;
  liveToolCalls?: SseToolCall[];
  subAgents?: SubAgentState[];
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

/** Render a single SSE tool call based on its name and result */
function renderToolCall(tc: SseToolCall) {
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
    // Still running — show query
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

  // show_text — this is the LLM's response text, render as styled assistant message
  if (name.includes('show_text') || name.includes('show_message')) {
    // Extract the actual text content from input or result
    let content = '';
    if (typeof tc.input?.text === 'string') {
      content = tc.input.text;
    } else if (tc.result && typeof tc.result === 'string') {
      // Result may be JSON-stringified {text: "..."} or raw text
      if (tc.result.startsWith('{')) {
        try {
          const parsed = JSON.parse(tc.result);
          content = parsed.text || '';
        } catch {
          // Not valid JSON, use as-is
          content = tc.result;
        }
      } else {
        content = tc.result;
      }
    }

    if (!content) {
      // Still running or no content — show pending indicator
      return (
        <div key={tc.tool_call_id} className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center flex-shrink-0">
            <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-medium text-text-secondary">Responding</span>
          </div>
        </div>
      );
    }
    const parsed = parseMessageContent(content);
    return (
      <div key={tc.tool_call_id} className="space-y-3">
        {parsed.thinking && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
              <Brain className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 bg-accent/5 border border-accent/10 rounded-xl p-3">
              <span className="text-xs font-medium text-accent">Thinking</span>
              <pre className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed overflow-x-auto mt-1">
                {parsed.thinking}
              </pre>
            </div>
          </div>
        )}
        {parsed.text && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center flex-shrink-0 text-xs font-medium">
              A
            </div>
            <div className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 markdown-content">
              <div
                className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed"
                dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(parsed.text) }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // print — show as intermediate step
  if (name === 'print') {
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

export function TurnTimeline({ status, messages, turns, stepCount, liveToolCalls, subAgents = [] }: TurnTimelineProps) {
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  const toggleTurn = (turn: number) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });
  };

  // Auto-expand all turns when running; collapse individually when user toggles
  if (status === 'running' && turns.length > 0) {
    const allTurnNumbers = turns.map((t) => t.turn);
    const allExpanded = allTurnNumbers.every((n) => expandedTurns.has(n));
    if (!allExpanded) {
      setExpandedTurns(new Set(allTurnNumbers));
    }
  }

  // Parse messages for thinking blocks and text
  const parsedMessages = useMemo(() => {
    return messages.map((msg) => parseMessageContent(msg.content));
  }, [messages]);

  // Group live tool calls by turn
  const toolCallsByTurn = useMemo(() => {
    const grouped = new Map<number, SseToolCall[]>();
    const tools = liveToolCalls || [];
    for (const tc of tools) {
      const turn = tc.turn || 0;
      if (!grouped.has(turn)) grouped.set(turn, []);
      grouped.get(turn)!.push(tc);
    }
    return grouped;
  }, [liveToolCalls]);

  // Collect show_text / intermediate steps separately
  // NOTE: show_text is the LLM's response text, already captured in messages via SSE message events.
  // We only collect genuine intermediate steps (show_message, print) here.
  const intermediateSteps = useMemo(() => {
    const steps: Array<{ text: string; type?: 'info' | 'success' | 'warning' | 'error' }> = [];
    const tools = liveToolCalls || [];
    for (const tc of tools) {
      const name = tc.tool_name.toLowerCase();
      if (name.includes('show_message') || name === 'print') {
        steps.push({ text: tc.result || JSON.stringify(tc.input) || tc.tool_name, type: 'info' });
      }
    }
    return steps;
  }, [liveToolCalls]);

  // Group sub-agents by dispatch turn for trace display
  const subAgentsByTurn = useMemo(() => {
    const grouped = new Map<number, SubAgentState[]>();
    for (const sa of subAgents) {
      // Sub-agents don't have a direct turn number, so we show them in a separate section
      if (!grouped.has(0)) grouped.set(0, []);
      grouped.get(0)!.push(sa);
    }
    return grouped;
  }, [subAgents]);

  if (messages.length === 0 && turns.length === 0 && !liveToolCalls?.length) {
    return (
      <div className="flex items-center justify-center gap-3 py-8 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin text-accent" />
        <span className="text-sm">Agent is thinking...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Intermediate steps — shown live during execution */}
      {intermediateSteps.length > 0 && status === 'running' && (
        <IntermediateSteps steps={intermediateSteps} status={status} />
      )}

      {/* Sub-agent dispatch trace */}
      {subAgents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Bot className="w-4 h-4 text-purple-400" />
            <span>Sub-agent dispatch</span>
            <span className="text-xs text-text-muted">({subAgents.length} dispatch{subAgents.length !== 1 ? 'es' : ''})</span>
          </div>
          {subAgents.map((sa) => (
            <SubAgentDispatchCard key={sa.id} subAgent={sa} />
          ))}
        </div>
      )}

      {/* Summary bar */}
      {turns.length > 0 && (
        <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
          <span>{turns.length} turn{turns.length !== 1 ? 's' : ''}</span>
          <span>&middot;</span>
          <span>{stepCount} steps</span>
          <span>&middot;</span>
          <span>{formatTokens(turns.reduce((s, t) => s + t.input_tokens, 0))} tokens in</span>
        </div>
      )}

      {/* Live tool calls (not yet grouped into turns from telemetry) */}
      {liveToolCalls && liveToolCalls.length > 0 && turns.length === 0 && (
        <div className="space-y-4">
          {liveToolCalls.map((tc) => (
            <ToolRenderer key={tc.tool_call_id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Live tool calls for turns that haven't received end_of_turn yet */}
      {liveToolCalls && liveToolCalls.length > 0 && turns.length > 0 && (() => {
        const latestTurn = turns[turns.length - 1]?.turn ?? 0;
        const pendingTools = liveToolCalls.filter(tc => tc.turn > latestTurn);
        if (pendingTools.length === 0) return null;
        return (
          <div className="space-y-4">
            {pendingTools.map((tc) => (
              <ToolRenderer key={tc.tool_call_id} toolCall={tc} />
            ))}
          </div>
        );
      })()}

      {/* Turn groups (from telemetry) */}
      {turns.map((turn) => {
        const isExpanded = expandedTurns.has(turn.turn);
        const toolCount = turn.toolCalls.length;
        const liveToolsForTurn = toolCallsByTurn.get(turn.turn) || [];

        return (
          <div key={turn.turn} className="space-y-2">
            {/* Turn header */}
            <button
              onClick={() => toggleTurn(turn.turn)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-surface border border-border rounded-xl hover:bg-surface/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-text-primary">
                  Turn {turn.turn}
                </span>
                <div className="flex items-center gap-1.5 text-xs text-text-muted">
                  <Cpu className="w-3 h-3" />
                  <span>{formatTokens(turn.input_tokens)} in / {formatTokens(turn.output_tokens)} out</span>
                </div>
                {toolCount > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <Hash className="w-3 h-3" />
                    <span>{toolCount} tool{toolCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {turn.context_tokens > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1.5 bg-background rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          (turn.context_tokens / turn.context_limit) > 0.8
                            ? 'bg-red-400'
                            : (turn.context_tokens / turn.context_limit) > 0.5
                            ? 'bg-yellow-400'
                            : 'bg-green-400'
                        }`}
                        style={{ width: `${Math.min((turn.context_tokens / turn.context_limit) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              )}
            </button>

            {/* Turn content */}
            {isExpanded && (
              <div className="space-y-3 pl-2 border-l-2 border-border/50 ml-4 py-1">
                {/* Messages for this turn */}
                {turn.messages.map((msg, idx) => {
                  const parsed = parseMessageContent(msg.content);
                  const hasContent = parsed.thinking || (parsed.text && msg.role === 'assistant');
                  if (!hasContent) return null;

                  return (
                    <div key={idx} className="space-y-3">
                      {/* Thinking block */}
                      {parsed.thinking && (
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 mt-1">
                            <Brain className="w-3.5 h-3.5 text-accent" />
                          </div>
                          <div className="flex-1 bg-accent/5 border border-accent/10 rounded-xl p-3">
                            <span className="text-xs font-medium text-accent">Thinking</span>
                            <pre className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed overflow-x-auto mt-1">
                              {parsed.thinking}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Assistant text */}
                      {parsed.text && msg.role === 'assistant' && (
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-surface border border-border flex items-center justify-center flex-shrink-0 mt-1 text-xs font-medium">
                            A
                          </div>
                          <div className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 markdown-content">
                            <div
                              className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(parsed.text) }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Live tool calls for this turn (SSE-format, real-time) */}
                {liveToolsForTurn.map((tc) => (
                  <ToolRenderer key={`live-${tc.tool_call_id}`} toolCall={tc} />
                ))}

                {/* Telemetry tool calls — use ToolCallCard for full result display */}
                {turn.toolCalls.map((tc, tcIdx) => {
                  // Skip if already rendered as a live tool (same tool_name + turn)
                  const isDuplicate = liveToolsForTurn.some(
                    (lt) => lt.tool_name === tc.tool_name && lt.turn === turn.turn
                  );
                  if (isDuplicate) return null;
                  return (
                    <ToolCallCard key={`telemetry-${tcIdx}`} toolCall={tc as ToolCallTelemetry} index={tcIdx} />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Fallback: show raw messages if no turn data */}
      {turns.length === 0 && !liveToolCalls?.length && parsedMessages.length > 0 && (
        <div className="space-y-3">
          {parsedMessages.map((parsed, idx) => (
            <div key={idx} className="bg-surface border border-border rounded-xl p-4 markdown-content">
              {parsed.thinking && (
                <div className="mb-3">
                  <span className="text-xs font-medium text-accent">Thinking</span>
                  <pre className="text-sm text-text-secondary whitespace-pre-wrap mt-1">{parsed.thinking}</pre>
                </div>
              )}
              {parsed.text && (
                <div
                  className="text-sm text-text-primary whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(parsed.text) }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Card showing a sub-agent dispatch — task, status, and result preview */
function SubAgentDispatchCard({ subAgent }: { subAgent: SubAgentState }) {
  const isRunning = subAgent.status === 'running';
  const isCompleted = subAgent.status === 'completed';

  return (
    <div className="bg-surface border border-purple-400/20 rounded-xl p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-purple-400/10 border border-purple-400/20 flex items-center justify-center">
          <Bot className="w-3 h-3 text-purple-400" />
        </div>
        <span className="text-xs font-semibold text-purple-400">{subAgent.name}</span>
        {isRunning && (
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            Running &middot; {subAgent.stepCount} steps
          </span>
        )}
        {isCompleted && (
          <span className="text-[10px] text-green-400">
            Completed &middot; {subAgent.stepCount} steps
          </span>
        )}
      </div>

      {/* Task description */}
      <div>
        <p className="text-[10px] font-medium text-text-muted mb-0.5">Task</p>
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
          {subAgent.taskDescription}
        </p>
      </div>

      {/* Result */}
      {isCompleted && subAgent.result && (
        <div>
          <p className="text-[10px] font-medium text-green-400 mb-0.5">Result</p>
          <pre className="text-xs text-text-muted whitespace-pre-wrap leading-relaxed line-clamp-5 overflow-x-auto">
            {subAgent.result.length > 800 ? `${subAgent.result.slice(0, 800)}...` : subAgent.result}
          </pre>
        </div>
      )}

      {/* Tool count */}
      {subAgent.toolCalls.length > 0 && (
        <p className="text-[10px] text-text-muted">
          Used {subAgent.toolCalls.length} tool{subAgent.toolCalls.length !== 1 ? 's' : ''} across {subAgent.currentTurn} turn{subAgent.currentTurn !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}