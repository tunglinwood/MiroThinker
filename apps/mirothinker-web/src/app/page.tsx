'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { listTasks, createTask, deleteTask, getTaskStatus, listConfigs, uploadFile, getTaskTelemetry, getStoredUser, logout, isAdmin } from '@/lib/api';
import { useSSE } from '@/lib/sse';
import { usePolling } from '@/lib/use-polling';
import { simpleMarkdownToHtml } from '@/lib/markdown';
import type { TaskStatusUpdate, UploadResponse, Task, TaskTelemetry, ToolCallTelemetry, Message, LogEntry } from '@/lib/types';
import { Sidebar } from '@/components/sidebar';
import { ChatInput } from '@/components/chat-input';
import { TurnTimeline } from '@/components/turn-timeline';
import { TaskOverview } from '@/components/task-overview';
import { ActivityLog } from '@/components/activity-log';
import { WelcomeScreen } from '@/components/welcome-screen';
import { ThemeToggle } from '@/components/theme-toggle';
import { SubAgentPanel } from '@/components/sub-agent-panel';
import { Bot, PanelLeftClose, PanelLeft, Square, LogOut, Shield } from 'lucide-react';

export default function Home() {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [uploadedFile, setUploadedFile] = useState<UploadResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [accumulatedMessages, setAccumulatedMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [adminRole, setAdminRole] = useState(false);

  // Auth check: redirect if no token
  useEffect(() => {
    const token = localStorage.getItem('mirothinker_token');
    const user = localStorage.getItem('mirothinker_user');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setUsername(user);
    setAdminRole(isAdmin());
  }, []);

  // Fetch configs
  const { data: configData } = useQuery({
    queryKey: ['configs'],
    queryFn: listConfigs,
  });

  // Fetch task list
  const { data: taskList } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => listTasks(1, 100),
    refetchInterval: 5000,
  });

  // Fetch selected task
  const { data: selectedTask } = useQuery({
    queryKey: ['task', selectedTaskId],
    queryFn: () => (selectedTaskId ? listTasks(1, 100).then((r) => r.tasks.find((t) => t.id === selectedTaskId)) : null),
    enabled: !!selectedTaskId,
  });

  const isSelectedTaskActive = selectedTask?.status === 'pending' || selectedTask?.status === 'running';
  const isSelectedTaskCompleted = ['completed', 'failed', 'cancelled'].includes(selectedTask?.status || '');

  // Stable callbacks for hooks (prevent infinite re-render loops)
  const handleSSEComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task', selectedTaskId] });
  }, [queryClient, selectedTaskId]);

  const fetchTaskStatus = useCallback(() => getTaskStatus(selectedTaskId!), [selectedTaskId]);

  const shouldStopPolling = useCallback(
    (data: TaskStatusUpdate) => ['completed', 'failed', 'cancelled'].includes(data.status),
    []
  );

  // SSE for real-time streaming
  const { data: sseData, connected: sseConnected, toolCalls: sseToolCalls, subAgents, turns: sseTurns } = useSSE({
    taskId: isActive(selectedTask) ? selectedTask!.id : null,
    enabled: isActive(selectedTask),
    onComplete: handleSSEComplete,
  });

  // Polling fallback
  const { data: polledData } = usePolling<TaskStatusUpdate>({
    fetcher: fetchTaskStatus,
    interval: 3000,
    enabled: isActive(selectedTask) && !sseConnected,
    shouldStop: shouldStopPolling,
  });

  // Fetch completed task status for messages
  const { data: completedStatus } = useQuery({
    queryKey: ['taskStatus', selectedTaskId],
    queryFn: () => getTaskStatus(selectedTaskId!),
    enabled: !!selectedTaskId && isSelectedTaskCompleted,
    staleTime: Infinity,
  });

  // Fetch telemetry for completed tasks
  const { data: telemetry } = useQuery({
    queryKey: ['telemetry', selectedTaskId],
    queryFn: () => getTaskTelemetry(selectedTaskId!),
    enabled: !!selectedTaskId && isSelectedTaskCompleted,
    staleTime: Infinity,
  });

  // Accumulate messages from SSE
  useEffect(() => {
    if (sseData?.messages && sseData.messages.length > 0) {
      setAccumulatedMessages((prev) => {
        const existingContents = new Set(prev.map((m) => m.content));
        const newMessages = sseData.messages.filter((m) => !existingContents.has(m.content));
        if (newMessages.length > 0) return [...prev, ...newMessages];
        return prev;
      });
    }
  }, [sseData?.messages]);

  // Reset on task switch
  useEffect(() => {
    setAccumulatedMessages([]);
  }, [selectedTaskId]);

  const currentStatus = isActive(selectedTask)
    ? (sseConnected ? sseData : polledData) || selectedTask
    : completedStatus || selectedTask;

  const messages = isActive(selectedTask)
    ? accumulatedMessages
    : completedStatus?.messages || accumulatedMessages || [];

  // Build turn data — prefer SSE-derived turns during execution, telemetry for completed tasks
  const turnData = useMemo(() => {
    // During execution, use SSE-derived turns directly
    if (sseTurns && sseTurns.length > 0 && isActive(selectedTask)) {
      return sseTurns.map((turn) => ({
        turn: turn.turn,
        messages: [] as Message[],
        toolCalls: turn.tool_calls,
        input_tokens: turn.input_tokens,
        output_tokens: turn.output_tokens,
        context_tokens: turn.context_tokens,
        context_limit: turn.context_limit,
      }));
    }

    // For completed tasks, use telemetry with message distribution
    if (!telemetry) return [];
    const turnCount = telemetry.turns.length;
    const allMessages = (currentStatus && 'messages' in currentStatus ? currentStatus.messages : undefined) || messages;

    // Distribute messages across turns: messages that arrive between turn boundaries
    // are grouped into the corresponding turn. Simple strategy: divide non-system
    // messages evenly across turns, keeping order.
    const userAndAssistant = allMessages.filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    );
    const systemMsgs = allMessages.filter((m) => m.role === 'system');

    const turnsWithMessages = telemetry.turns.map((turn, idx) => {
      const msgsPerTurn = Math.floor(userAndAssistant.length / turnCount);
      const remainder = userAndAssistant.length % turnCount;
      const start = idx * msgsPerTurn + Math.min(idx, remainder);
      const end = start + msgsPerTurn + (idx < remainder ? 1 : 0);

      return {
        turn: turn.turn,
        messages: userAndAssistant.slice(start, end) as Message[],
        toolCalls: turn.tool_calls,
        input_tokens: turn.input_tokens,
        output_tokens: turn.output_tokens,
        context_tokens: turn.context_tokens,
        context_limit: turn.context_limit,
      };
    });

    // Attach system messages to the last turn
    if (systemMsgs.length > 0 && turnsWithMessages.length > 0) {
      const last = turnsWithMessages[turnsWithMessages.length - 1];
      last.messages = [...last.messages, ...systemMsgs] as Message[];
    }

    return turnsWithMessages;
  }, [sseTurns, telemetry, isActive(selectedTask), (currentStatus && 'messages' in currentStatus ? currentStatus.messages : undefined), messages]);

  // Build log entries from recent_logs (backend format: step_name, message, info_level)
  const logEntries = useMemo((): LogEntry[] => {
    const entries: LogEntry[] = [];

    if (currentStatus && 'recent_logs' in currentStatus) {
      const logs = (currentStatus as TaskStatusUpdate).recent_logs || [];
      for (const log of logs) {
        const raw = log as unknown as Record<string, unknown>;
        const stepName = (raw.step_name || '') as string;
        const msg = (raw.message || '') as string;
        const infoLevel = (raw.info_level || 'info') as string;

        // Classify based on step_name patterns
        let type = 'tool_call';
        if (stepName.includes('Token Usage') || stepName.includes('Usage Calculation')) {
          type = 'context';
        } else if (stepName.includes('Response Status')) {
          type = 'status';
        } else if (
          stepName.includes('Final Summary') ||
          stepName.includes('Final Answer') ||
          stepName.includes('Final boxed') ||
          stepName.includes('Message Retention') ||
          stepName.includes('task_execution_finished') ||
          stepName.includes('Task Completed')
        ) {
          type = 'retention';
        } else if (stepName.includes('Tool Call') || stepName.includes('MCP')) {
          type = 'tool_call';
        }

        entries.push({
          type,
          tool_name: (raw.tool_name as string) || undefined,
          server_name: (raw.server_name as string) || undefined,
          input: stepName ? `${stepName}: ${msg}` : msg,
          output: undefined,
        });
      }
    }

    // From telemetry: add retention, context, status events
    if (telemetry) {
      for (const turn of telemetry.turns) {
        if (turn.message_retention) {
          entries.push({ type: 'retention', input: turn.message_retention });
        }
        entries.push({ type: 'context', input: `${turn.context_tokens}/${turn.context_limit}` });
        if (turn.response_status) {
          entries.push({ type: 'status', input: turn.response_status });
        }
      }
    }

    return entries;
  }, [currentStatus, telemetry]);

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: (task) => {
      setSelectedTaskId(task.id);
      setUploadedFile(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: (_, taskId) => {
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const handleSubmit = (description: string) => {
    if (!description.trim() || createMutation.isPending) return;
    createMutation.mutate({
      task_description: description,
      agent_config: configData?.default_agent || 'mirothinker_1.7_microsandbox',
      llm_config: configData?.default_llm || 'local-qwen35',
      file_id: uploadedFile?.file_id,
    });
  };

  const handleFileSelect = async (file: File) => {
    setIsUploading(true);
    try {
      const result = await uploadFile(file);
      setUploadedFile(result);
    } catch {
      // Upload failed — silently handled
    } finally {
      setIsUploading(false);
    }
  };

  const handleStopTask = () => {
    if (selectedTask?.status === 'running' || selectedTask?.status === 'pending') {
      cancelMutation.mutate(selectedTask.id);
    }
  };

  return (
    <div className="flex h-screen bg-background text-text-primary">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        selectedTaskId={selectedTaskId}
        onSelectTask={(task) => setSelectedTaskId(task.id)}
        onDeleteTask={(taskId) => deleteMutation.mutate(taskId)}
        onNewChat={() => setSelectedTaskId(null)}
        taskList={taskList}
      />

      {/* Sub-Agent Side Panel */}
      <SubAgentPanel subAgents={subAgents} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background-secondary backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-surface rounded-lg transition-colors"
          >
            {sidebarOpen ? <PanelLeftClose className="w-5 h-5 text-text-secondary" /> : <PanelLeft className="w-5 h-5 text-text-secondary" />}
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-accent" />
            <span className="font-semibold text-text-primary">MiroThinker</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {username && (
              <span className="text-sm text-text-secondary">{username}</span>
            )}
            {adminRole && (
              <Link href="/admin" className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors text-xs font-medium">
                <Shield className="w-3.5 h-3.5" />
                Admin
              </Link>
            )}
            <button
              onClick={logout}
              className="p-2 hover:bg-surface rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4 text-text-secondary" />
            </button>
            <ThemeToggle />
          </div>
          {currentStatus && (
            <div className="flex items-center gap-3 text-sm">
              {(currentStatus.status === 'running' || currentStatus.status === 'pending') && (
                <>
                  <span className="text-text-secondary">
                    Turn {currentStatus.current_turn} &middot; {currentStatus.step_count} steps
                  </span>
                  {sseConnected && (
                    <span className="flex items-center gap-1 text-success text-xs">
                      <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                      Live
                    </span>
                  )}
                  <button
                    onClick={handleStopTask}
                    disabled={cancelMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors disabled:opacity-50 text-xs"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    Stop
                  </button>
                </>
              )}
              {currentStatus.status === 'completed' && (
                <span className="text-success font-medium text-xs">Completed</span>
              )}
              {currentStatus.status === 'failed' && (
                <span className="text-error font-medium text-xs">Failed</span>
              )}
              {currentStatus.status === 'cancelled' && (
                <span className="text-text-muted font-medium text-xs">Stopped</span>
              )}
            </div>
          )}
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {!selectedTask ? (
            <WelcomeScreen
              examples={[
                'What is the current stock price of NVDA vs TSLA, and which grew more since Jan 2024?',
                'What was the most recent Nobel Prize in Physics awarded for?',
                'Calculate the Fibonacci sequence up to the 50th term and show convergence to the golden ratio.',
                'Summarize the latest developments in AI agent frameworks.',
              ]}
              onSelectExample={handleSubmit}
            />
          ) : (
            <div className="max-w-5xl mx-auto p-4 space-y-6">
              {/* User Question */}
              <UserQuestionBubble content={selectedTask.task_description} />

              {/* Task Overview — shown for completed tasks with telemetry */}
              {isSelectedTaskCompleted && telemetry && (
                <TaskOverview telemetry={telemetry} />
              )}

              {/* Timeline of agent activity */}
              <TurnTimeline
                status={currentStatus?.status || 'pending'}
                messages={messages}
                turns={turnData}
                stepCount={currentStatus?.step_count || 0}
                liveToolCalls={sseToolCalls}
                subAgents={subAgents}
              />

              {/* Activity Log */}
              {logEntries.length > 0 && (
                <ActivityLog logs={logEntries} />
              )}

              {/* Completed state */}
              {currentStatus?.status === 'completed' && (
                <CompletedSection
                  finalAnswer={currentStatus.final_answer}
                  summary={currentStatus.summary}
                />
              )}

              {/* Error state */}
              {currentStatus?.status === 'failed' && currentStatus.error_message && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-error/20 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-error" />
                  </div>
                  <div className="flex-1 bg-error/10 border border-error/20 rounded-lg p-4">
                    <p className="text-error font-medium mb-2">Error</p>
                    <pre className="text-xs text-error/80 whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
                      {currentStatus.error_message}
                    </pre>
                  </div>
                </div>
              )}

              {/* Cancelled state */}
              {currentStatus?.status === 'cancelled' && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                    <Square className="w-4 h-4 text-text-muted" />
                  </div>
                  <div className="flex-1 bg-surface border border-border rounded-lg p-4">
                    <p className="text-text-muted">Task was stopped.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-border bg-background-secondary p-4">
          <ChatInput
            onSubmit={handleSubmit}
            onFileSelect={handleFileSelect}
            isUploading={isUploading}
            isPending={createMutation.isPending}
            isDisabled={isActive(selectedTask)}
            uploadedFile={uploadedFile}
            onRemoveFile={() => setUploadedFile(null)}
          />
        </div>
      </div>
    </div>
  );
}

function isActive(task: Task | null | undefined): boolean {
  return task?.status === 'pending' || task?.status === 'running';
}

function UserQuestionBubble({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center flex-shrink-0 text-sm font-medium">
        U
      </div>
      <div className="flex-1 bg-surface border border-border rounded-xl px-4 py-3">
        <p className="text-text-primary whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

function CompletedSection({ finalAnswer, summary }: { finalAnswer: string | null; summary: string | null }) {
  const [showTrajectory, setShowTrajectory] = useState(false);

  if (!finalAnswer && !summary) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Success header */}
      <div className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-success bg-success/10 border border-success/20 rounded-lg">
        <span>Answer found</span>
      </div>

      {/* Final answer */}
      {finalAnswer && (
        <div className="bg-surface border border-border rounded-xl p-5 markdown-content">
          <div dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(finalAnswer) }} />
        </div>
      )}

      {/* Detailed report */}
      {summary && (
        <div className="space-y-3">
          <button
            onClick={() => setShowTrajectory(!showTrajectory)}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            {showTrajectory ? 'Hide' : 'Show'} detailed report
          </button>
          {showTrajectory && (
            <div className="bg-surface border border-border rounded-xl p-5 markdown-content max-h-[600px] overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(summary) }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

