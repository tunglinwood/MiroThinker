'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listTasks, createTask, deleteTask, getTaskStatus, listConfigs, uploadFile } from '@/lib/api';
import { useSSE } from '@/lib/sse';
import { usePolling } from '@/lib/use-polling';
import type { TaskStatusUpdate, UploadResponse, Task } from '@/lib/types';
import { Sidebar } from '@/components/sidebar';
import { ChatInput } from '@/components/chat-input';
import { Timeline } from '@/components/timeline';
import { WelcomeScreen } from '@/components/welcome-screen';
import { Bot, PanelLeftClose, PanelLeft, Square } from 'lucide-react';

export default function Home() {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [uploadedFile, setUploadedFile] = useState<UploadResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [accumulatedMessages, setAccumulatedMessages] = useState<Array<{ role: string; content: string }>>([]);

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

  // SSE for real-time streaming
  const { data: sseData, connected: sseConnected } = useSSE({
    taskId: isActive(selectedTask) ? selectedTask!.id : null,
    enabled: isActive(selectedTask),
    onComplete: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', selectedTaskId] });
    },
  });

  // Polling fallback
  const { data: polledData } = usePolling<TaskStatusUpdate>({
    fetcher: () => getTaskStatus(selectedTaskId!),
    interval: 3000,
    enabled: isActive(selectedTask) && !sseConnected,
    shouldStop: (data) => ['completed', 'failed', 'cancelled'].includes(data.status),
  });

  // Fetch completed task status for messages
  const { data: completedStatus } = useQuery({
    queryKey: ['taskStatus', selectedTaskId],
    queryFn: () => getTaskStatus(selectedTaskId!),
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
          {currentStatus && (
            <div className="ml-auto flex items-center gap-3 text-sm">
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
            <div className="max-w-4xl mx-auto p-4 space-y-6">
              {/* User Question */}
              <UserQuestionBubble content={selectedTask.task_description} />

              {/* Timeline of agent activity */}
              <Timeline
                status={currentStatus?.status || 'pending'}
                messages={messages}
                logs={'recent_logs' in (currentStatus || {}) ? (currentStatus as TaskStatusUpdate)?.recent_logs || [] : []}
                stepCount={currentStatus?.step_count || 0}
              />

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

  // Simple markdown rendering for the answer
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

// Simple markdown to HTML converter for rendering
function simpleMarkdownToHtml(text: string): string {
  return text
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mb-2 mt-4 text-text-primary">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mb-3 mt-4 text-text-primary">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mb-4 mt-4 text-text-primary">$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-text-primary">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-background p-3 rounded-lg mb-3 overflow-x-auto border border-border"><code class="text-text-secondary text-sm">$2</code></pre>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-background px-1.5 py-0.5 rounded text-sm text-accent">$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">$1</a>')
    // Tables (basic)
    .replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, (_match, header, body) => {
      const headers = header.split('|').map((h: string) => h.trim()).filter(Boolean);
      const rows = body.trim().split('\n').map((row: string) =>
        row.split('|').map((c: string) => c.trim()).filter(Boolean)
      );
      let table = '<table class="w-full border-collapse mb-4"><thead><tr>';
      headers.forEach((h: string) => { table += `<th class="bg-surface border border-border px-3 py-2 text-left text-text-primary">${h}</th>`; });
      table += '</tr></thead><tbody>';
      rows.forEach((row: string[]) => {
        table += '<tr>';
        row.forEach((cell) => { table += `<td class="border border-border px-3 py-2 text-text-secondary">${cell}</td>`; });
        table += '</tr>';
      });
      table += '</tbody></table>';
      return table;
    })
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="border-border my-4" />')
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="mb-3 text-text-secondary">')
    // Line breaks
    .replace(/\n/g, '<br />')
    // Wrap in paragraph if not already wrapped
    .replace(/^(?!<[a-z])/, '<p class="mb-3 text-text-secondary">')
    .replace(/(?<![>])$/, '</p>');
}
