'use client';

import { Plus, Trash2, Loader2, CheckCircle2, XCircle, Square } from 'lucide-react';
import type { TaskListResponse } from '@/lib/types';

interface SidebarProps {
  open: boolean;
  selectedTaskId: string | null;
  onSelectTask: (task: { id: string; task_description: string }) => void;
  onDeleteTask: (taskId: string) => void;
  onNewChat: () => void;
  taskList: TaskListResponse | undefined;
}

const statusIcons: Record<string, React.ReactNode> = {
  running: <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />,
  pending: <Loader2 className="w-3.5 h-3.5 text-text-muted animate-pulse" />,
  completed: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
  failed: <XCircle className="w-3.5 h-3.5 text-error" />,
  cancelled: <Square className="w-3.5 h-3.5 text-text-muted" />,
};

export function Sidebar({
  open,
  selectedTaskId,
  onSelectTask,
  onDeleteTask,
  onNewChat,
  taskList,
}: SidebarProps) {
  const tasks = taskList?.tasks || [];

  return (
    <div
      className={`flex flex-col border-r border-border bg-background-secondary transition-all duration-300 ease-in-out ${
        open ? 'w-72' : 'w-0 overflow-hidden'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="font-semibold text-text-primary text-sm">Chat History</h2>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors text-xs font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted text-sm">
            <p>No conversations yet</p>
            <p className="text-xs mt-1">Start a new chat to begin</p>
          </div>
        )}
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => onSelectTask(task)}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group relative ${
              selectedTaskId === task.id
                ? 'bg-accent/10 border border-accent/20'
                : 'hover:bg-surface border border-transparent'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex-shrink-0">
                {statusIcons[task.status] || statusIcons.pending}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate leading-snug">
                  {task.task_description.length > 60
                    ? `${task.task_description.slice(0, 60)}...`
                    : task.task_description}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {task.status === 'completed'
                    ? `${task.step_count} steps`
                    : `Turn ${task.current_turn}`}
                </p>
              </div>
            </div>
            {/* Delete button on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteTask(task.id);
              }}
              className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-error/20 text-error transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}
