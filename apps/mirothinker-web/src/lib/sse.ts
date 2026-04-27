// SSE streaming hook for MiroThinker events
// Connects to the MiroThinker SSE endpoint and accumulates events

import { useState, useEffect, useRef, useCallback } from 'react';
import type { TaskStatus, TaskStatusUpdate, Message, LogEntry, SseToolCall, SubAgentState } from './types';
import { getApiBaseUrl } from './api';

interface UseSSEOptions {
  taskId: string | null;
  enabled?: boolean;
  onStatusChange?: (status: string) => void;
  onComplete?: () => void;
}

interface SSEState {
  status: string;
  current_turn: number;
  step_count: number;
  messages: Message[];
  toolCalls: SseToolCall[];
  recent_logs: LogEntry[];
  final_answer: string | null;
  summary: string | null;
  error_message: string | null;
  connected: boolean;
  error: string | null;
  // Sub-agent state (array for parallel dispatch)
  subAgents: SubAgentState[];
}

const initialState: SSEState = {
  status: 'running',
  current_turn: 0,
  step_count: 0,
  messages: [],
  toolCalls: [],
  recent_logs: [],
  final_answer: null,
  summary: null,
  error_message: null,
  connected: false,
  error: null,
  subAgents: [],
};

export function useSSE({ taskId, enabled = true, onStatusChange, onComplete }: UseSSEOptions) {
  const [state, setState] = useState<SSEState>(initialState);
  const messageAccumRef = useRef<Map<string, string>>(new Map());
  const toolCallsRef = useRef<Map<string, SseToolCall>>(new Map());
  const logAccumRef = useRef<LogEntry[]>([]);
  const turnCountRef = useRef(0);
  const stepCountRef = useRef(0);
  const activeTaskIdRef = useRef<string | null>(null);
  // Sub-agent refs (Map-based for parallel dispatch)
  const subAgentMessageAccumRef = useRef<Map<string, Map<string, string>>>(new Map()); // sub_agent_id -> (msg_id -> content)
  const subAgentToolCallsRef = useRef<Map<string, Map<string, SseToolCall>>>(new Map()); // sub_agent_id -> (tool_call_id -> toolCall)
  const subAgentTurnCountRef = useRef<Map<string, number>>(new Map());
  const subAgentStepCountRef = useRef<Map<string, number>>(new Map());
  const subAgentActiveIdsRef = useRef<Set<string>>(new Set());
  const subAgentLogAccumRef = useRef<LogEntry[]>([]); // sub-agent log entries for activity log

  // Keep callback refs up to date so the effect doesn't re-run when they change
  const onStatusChangeRef = useRef(onStatusChange);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; }, [onStatusChange]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const disconnect = useCallback(() => {
    // fetch-based SSE uses AbortController, nothing to clean up here
  }, []);

  useEffect(() => {
    if (!taskId || !enabled) return;

    // Only reset accumulators when taskId actually changes
    if (activeTaskIdRef.current !== taskId) {
      activeTaskIdRef.current = taskId;
      messageAccumRef.current = new Map();
      toolCallsRef.current = new Map();
      logAccumRef.current = [];
      turnCountRef.current = 0;
      stepCountRef.current = 0;
      subAgentMessageAccumRef.current = new Map();
      subAgentToolCallsRef.current = new Map();
      subAgentActiveIdsRef.current = new Set();
      subAgentLogAccumRef.current = [];
      setState(initialState);
    }

    const url = `${getApiBaseUrl()}/api/tasks/${taskId}/stream`;
    const token = typeof window !== 'undefined' ? localStorage.getItem('mirothinker_token') : null;

    // Use fetch + ReadableStream instead of EventSource so we can send auth headers
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          setState((prev) => ({ ...prev, error: `SSE connection failed: ${response.status}`, connected: false }));
          return;
        }

        setState((prev) => ({ ...prev, connected: true, error: null }));

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let eventType = 'message';
          let dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              // Collect all data: lines (SSE spec supports multi-line data)
              dataLines.push(line.slice(5));
            }

            // Process complete event after the last data: line or empty line
            if (dataLines.length > 0 && (line.startsWith('data:') || line === '')) {
              try {
                const data = dataLines.join('\n').trim();
                const parsed = JSON.parse(data);
                handleSSEEvent(eventType, parsed);
              } catch {
                // skip malformed JSON
              }
              // Reset for next event
              eventType = 'message';
              dataLines = [];
            }
          }
        }

        // Stream ended — call complete
        disconnect();
        onCompleteRef.current?.();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState((prev) => ({ ...prev, error: String(err), connected: false }));
        disconnect();
      }
    })();

    return () => {
      controller.abort();
      disconnect();
    };

    function handleSSEEvent(eventType: string, data: Record<string, unknown>) {
      switch (eventType) {
        case 'start_of_workflow':
          if (Array.isArray(data.input)) {
            const initialMessages: Message[] = data.input.map(
              (msg: { role: string; content: string }) => ({
                role: msg.role,
                content: msg.content,
              })
            );
            setState((prev) => ({ ...prev, messages: initialMessages }));
          }
          break;

        case 'start_of_agent':
          setState((prev) => ({ ...prev, status: 'running' }));
          break;

        case 'start_of_llm':
          if (subAgentActiveIdsRef.current.size > 0) {
            // Increment turn count for all active sub-agents
            for (const saId of subAgentActiveIdsRef.current) {
              const count = (subAgentTurnCountRef.current.get(saId) || 0) + 1;
              subAgentTurnCountRef.current.set(saId, count);
            }
            setState((prev) => ({
              ...prev,
              subAgents: prev.subAgents.map((sa) =>
                subAgentActiveIdsRef.current.has(sa.id)
                  ? { ...sa, currentTurn: subAgentTurnCountRef.current.get(sa.id) || 0 }
                  : sa
              ),
            }));
          } else {
            turnCountRef.current += 1;
            setState((prev) => ({ ...prev, current_turn: turnCountRef.current }));
          }
          break;

        case 'message':
          if (data.message_id && (data.delta as Record<string, unknown>)) {
            const delta = data.delta as Record<string, unknown>;
            const content = delta.content as string;
            if (content) {
              const msgId = data.message_id as string;
              const subAgentId = data.agent_id as string | undefined;

              if (subAgentId && subAgentActiveIdsRef.current.has(subAgentId)) {
                // Route to specific sub-agent
                let msgMap = subAgentMessageAccumRef.current.get(subAgentId);
                if (!msgMap) {
                  msgMap = new Map();
                  subAgentMessageAccumRef.current.set(subAgentId, msgMap);
                }
                const existing = msgMap.get(msgId) || '';
                msgMap.set(msgId, existing + content);
                const messages: Message[] = [];
                for (const [, c] of msgMap) {
                  messages.push({ role: 'assistant', content: c });
                }
                setState((prev) => ({
                  ...prev,
                  subAgents: prev.subAgents.map((sa) =>
                    sa.id === subAgentId ? { ...sa, messages } : sa
                  ),
                }));
              } else {
                // Route to main agent
                const existing = messageAccumRef.current.get(msgId) || '';
                messageAccumRef.current.set(msgId, existing + content);

                const messages: Message[] = [];
                for (const [, c] of messageAccumRef.current) {
                  messages.push({ role: 'assistant', content: c });
                }
                setState((prev) => ({ ...prev, messages }));
              }
            }
          }
          break;

        case 'tool_call': {
          const toolCallId = (data.tool_call_id as string) || '';
          const subAgentId = data.agent_id as string | undefined;

          if (subAgentId && subAgentActiveIdsRef.current.has(subAgentId)) {
            // Route to specific sub-agent
            let stepCount = (subAgentStepCountRef.current.get(subAgentId) || 0) + 1;
            subAgentStepCountRef.current.set(subAgentId, stepCount);

            let tcMap = subAgentToolCallsRef.current.get(subAgentId);
            if (!tcMap) {
              tcMap = new Map();
              subAgentToolCallsRef.current.set(subAgentId, tcMap);
            }

            let tc = tcMap.get(toolCallId);
            if (!tc) {
              const turnCount = subAgentTurnCountRef.current.get(subAgentId) || 0;
              tc = {
                tool_call_id: toolCallId,
                tool_name: (data.tool_name as string) || '',
                server_name: (data.server_name as string) || '',
                turn: turnCount,
                input: null,
                result: null,
                status: 'pending',
              };
              tcMap.set(toolCallId, tc);
            }

            if (data.tool_input) {
              const input = data.tool_input as Record<string, unknown>;
              if (input.result && typeof input.result === 'string') {
                tc.result = input.result as string;
                tc.status = 'completed';
              } else if (!tc.input) {
                tc.input = input;
                tc.result = JSON.stringify(input, null, 2);
                tc.status = 'completed';
              } else if (input.result) {
                tc.result = input.result as string;
                tc.status = 'completed';
              }
            }
            if (data.tool_output && !tc.result) {
              tc.result = JSON.stringify(data.tool_output);
              tc.status = 'completed';
            }

            const allToolCalls = Array.from(tcMap.values());

            setState((prev) => {
              const saName = prev.subAgents.find((s) => s.id === subAgentId)?.name || '';
              const logEntry: LogEntry = {
                type: 'tool_call',
                tool_name: tc.tool_name,
                server_name: tc.server_name,
                tool_call_id: toolCallId,
                sub_agent_name: saName,
                input: tc.input ? JSON.stringify(tc.input).slice(0, 300) : undefined,
                output: tc.result ? (tc.result.length > 300 ? tc.result.slice(0, 300) + '...' : tc.result) : undefined,
              };
              subAgentLogAccumRef.current.push(logEntry);
              return {
                ...prev,
                subAgents: prev.subAgents.map((sa) =>
                  sa.id === subAgentId
                    ? { ...sa, toolCalls: allToolCalls, stepCount }
                    : sa
                ),
                recent_logs: [...prev.recent_logs, logEntry],
              };
            });
          } else {
            // Route to main agent (existing logic)
            stepCountRef.current += 1;
            let tc = toolCallsRef.current.get(toolCallId);
            if (!tc) {
              tc = {
                tool_call_id: toolCallId,
                tool_name: (data.tool_name as string) || '',
                server_name: (data.server_name as string) || '',
                turn: turnCountRef.current,
                input: null,
                result: null,
                status: 'pending',
              };
              toolCallsRef.current.set(toolCallId, tc);
            }

            if (data.tool_input) {
              const input = data.tool_input as Record<string, unknown>;
              if (input.result && typeof input.result === 'string') {
                tc.result = input.result as string;
                tc.status = 'completed';
              } else if (!tc.input) {
                tc.input = input;
                tc.result = JSON.stringify(input, null, 2);
                tc.status = 'completed';
              } else if (input.result) {
                tc.result = input.result as string;
                tc.status = 'completed';
              }
            }

            if (data.tool_output && !tc.result) {
              tc.result = JSON.stringify(data.tool_output);
              tc.status = 'completed';
            }

            const logEntry: LogEntry = {
              type: 'tool_call',
              tool_name: data.tool_name as string,
              server_name: data.server_name as string,
              tool_call_id: toolCallId,
            };
            if (tc.input) logEntry.input = JSON.stringify(tc.input, null, 2);
            if (tc.result) logEntry.output = tc.result.length > 500 ? tc.result.slice(0, 500) : tc.result;

            const existingIdx = logAccumRef.current.findIndex((l) => l.tool_call_id === toolCallId);
            if (existingIdx >= 0) {
              logAccumRef.current[existingIdx] = logEntry;
            } else {
              logAccumRef.current.push(logEntry);
            }

            const allToolCalls = Array.from(toolCallsRef.current.values());
            const recentLogs = logAccumRef.current.slice(-50);

            setState((prev) => ({
              ...prev,
              step_count: stepCountRef.current,
              toolCalls: allToolCalls,
              recent_logs: recentLogs,
            }));
          }
          break;
          break;
        }

        case 'end_of_llm':
          onStatusChangeRef.current?.('running');
          break;

        case 'end_of_agent':
          onStatusChangeRef.current?.('running');
          break;

        case 'end_of_workflow':
          setState((prev) => ({ ...prev, status: 'completed' }));
          disconnect();
          onCompleteRef.current?.();
          break;

        case 'show_error':
          setState((prev) => ({
            ...prev,
            status: 'failed',
            error_message: (data.error as string) || 'An error occurred',
          }));
          disconnect();
          onCompleteRef.current?.();
          break;

        case 'done':
          disconnect();
          onCompleteRef.current?.();
          break;

        case 'start_of_sub_agent': {
          // Sub-agent started — initialize accumulators for this sub-agent
          const subAgentId = (data.sub_agent_id as string) || '';
          subAgentMessageAccumRef.current.set(subAgentId, new Map());
          subAgentToolCallsRef.current.set(subAgentId, new Map());
          subAgentTurnCountRef.current.set(subAgentId, 0);
          subAgentStepCountRef.current.set(subAgentId, 0);
          subAgentActiveIdsRef.current.add(subAgentId);

          const name = (data.sub_agent_name as string) || '';
          const displayName = name.replace('agent-', '');

          setState((prev) => ({
            ...prev,
            subAgents: [
              ...prev.subAgents,
              {
                id: subAgentId,
                name: displayName,
                taskDescription: (data.task_description as string) || '',
                status: 'running',
                messages: [],
                toolCalls: [],
                currentTurn: 0,
                stepCount: 0,
                result: null,
              },
            ],
          }));
          break;
        }

        case 'end_of_sub_agent': {
          const subAgentId = (data.sub_agent_id as string) || '';
          subAgentActiveIdsRef.current.delete(subAgentId);
          setState((prev) => ({
            ...prev,
            subAgents: prev.subAgents.map((sa) =>
              sa.id === subAgentId
                ? {
                    ...sa,
                    status: 'completed',
                    result: (data.result as string) || null,
                  }
                : sa
            ),
          }));
          break;
        }
          break;
      }
    }
  }, [taskId, enabled, disconnect]);

  const statusUpdate: TaskStatusUpdate = {
    id: taskId || '',
    status: state.status as TaskStatus,
    current_turn: state.current_turn,
    step_count: state.step_count,
    recent_logs: state.recent_logs,
    messages: state.messages,
    final_answer: state.final_answer,
    summary: state.summary,
    error_message: state.error_message,
  };

  return {
    data: statusUpdate,
    toolCalls: state.toolCalls,
    connected: state.connected,
    error: state.error,
    subAgents: state.subAgents,
  };
}
