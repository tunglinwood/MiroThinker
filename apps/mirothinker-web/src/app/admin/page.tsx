'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminHealth, getAdminUsers, getAdminTasks, isAdmin, logout, cancelTask } from '@/lib/api';
import { formatTimestamp, truncateTitle } from '@/lib/api';
import type { AdminUser, Task } from '@/lib/types';
import {
  Activity, Users, ListTodo, ArrowLeft, Shield,
  CheckCircle2, XCircle, Loader2, Square, AlertTriangle,
  ExternalLink, Power, Search, RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';

const statusIcons: Record<string, React.ReactNode> = {
  running: <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />,
  pending: <Loader2 className="w-3.5 h-3.5 text-text-muted animate-pulse" />,
  completed: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
  failed: <XCircle className="w-3.5 h-3.5 text-error" />,
  cancelled: <Square className="w-3.5 h-3.5 text-text-muted" />,
};

const statusColors: Record<string, string> = {
  running: 'text-accent',
  pending: 'text-text-muted',
  completed: 'text-success',
  failed: 'text-error',
  cancelled: 'text-text-muted',
};

export default function AdminPage() {
  const [userFilter, setUserFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [taskPage, setTaskPage] = useState(1);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin()) {
      window.location.href = '/';
      return;
    }
    setUsername(localStorage.getItem('mirothinker_user'));
  }, []);

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['admin-health'],
    queryFn: getAdminHealth,
    refetchInterval: 10000,
  });

  const { data: usersData } = useQuery({
    queryKey: ['admin-users'],
    queryFn: getAdminUsers,
    refetchInterval: 15000,
  });

  const { data: tasksData } = useQuery({
    queryKey: ['admin-tasks', userFilter, statusFilter, taskPage],
    queryFn: () => getAdminTasks(taskPage, 50, userFilter || undefined, statusFilter || undefined),
    refetchInterval: 5000,
  });

  const users = usersData?.users || [];

  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: cancelTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['admin-health'] });
    },
  });

  const handleCancelTask = (taskId: string) => {
    if (confirm('Stop this task?')) {
      cancelMutation.mutate(taskId);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-text-primary">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background-secondary">
        <Link href="/" className="p-2 hover:bg-surface rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent" />
          <span className="font-semibold text-text-primary">Admin Dashboard</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {username && <span className="text-sm text-text-secondary">{username}</span>}
          <ThemeToggle />
          <button onClick={logout} className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors text-xs">
            <Power className="w-3 h-3" />
            Logout
          </button>
        </div>
      </header>

      <div className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="API Status"
            value={health?.status || 'loading'}
            color={health?.status === 'healthy' ? 'text-success' : health?.status === 'degraded' ? 'text-warning' : 'text-error'}
          />
          <StatCard
            icon={<Loader2 className="w-5 h-5 animate-spin" />}
            label="Active Tasks"
            value={health?.active_tasks ?? 0}
            color="text-accent"
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Total Users"
            value={health?.total_users ?? 0}
            color="text-info"
          />
          <StatCard
            icon={<ListTodo className="w-5 h-5" />}
            label="Total Tasks"
            value={tasksData?.total ?? 0}
            color="text-text-primary"
          />
        </div>

        {/* Service Health */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" />
            Service Health
          </h2>
          {healthLoading ? (
            <div className="flex items-center justify-center py-8 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Checking services...
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {health && Object.entries(health.services).map(([name, svc]) => (
                <div key={name} className="bg-background rounded-lg border border-border/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ServiceDot status={svc.status} />
                    <span className="text-xs font-medium capitalize text-text-primary">{name}</span>
                  </div>
                  {svc.response_time_ms != null && (
                    <p className="text-[10px] text-text-muted">{svc.response_time_ms}ms</p>
                  )}
                  {svc.details && (
                    <p className="text-[10px] text-text-muted truncate" title={svc.details}>{svc.details}</p>
                  )}
                  {svc.url && !svc.details && (
                    <p className="text-[10px] text-text-muted truncate" title={svc.url}>{svc.url}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {health && (
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-4 text-xs text-text-muted">
              <span>Uptime: {formatUptime(health.uptime_seconds)}</span>
              <span>Version: {health.version}</span>
            </div>
          )}
        </div>

        {/* Active Users */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            Users ({users.length})
          </h2>
          {users.length === 0 ? (
            <p className="text-sm text-text-muted py-4">No users yet</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {users.map((user) => (
                <UserCard key={user.username} user={user} onSelect={() => setUserFilter(user.username === userFilter ? '' : user.username)} active={userFilter === user.username} />
              ))}
            </div>
          )}
        </div>

        {/* All Tasks */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-accent" />
              All Tasks ({tasksData?.total ?? 0})
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setTaskPage(1); }}
                className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-text-primary"
              >
                <option value="">All Status</option>
                <option value="running">Running</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              {userFilter && (
                <button
                  onClick={() => setUserFilter('')}
                  className="flex items-center gap-1 px-2 py-1 bg-accent/10 text-accent rounded-lg text-xs"
                >
                  <span>Filter: {userFilter}</span>
                  <XCircle className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => { setTaskPage(1); setUserFilter(''); setStatusFilter(''); }}
                className="p-1 hover:bg-surface-hover rounded text-text-muted"
                title="Reset filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {tasksData?.tasks.map((task) => (
              <TaskRow key={task.id} task={task} onCancel={handleCancelTask} />
            ))}
            {tasksData?.tasks.length === 0 && (
              <p className="text-sm text-text-muted py-8 text-center">No tasks found</p>
            )}
          </div>

          {/* Pagination */}
          {tasksData && tasksData.total > tasksData.page_size && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
              <span className="text-xs text-text-muted">
                Page {tasksData.page} of {Math.ceil(tasksData.total / tasksData.page_size)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTaskPage((p) => Math.max(1, p - 1))}
                  disabled={taskPage <= 1}
                  className="px-3 py-1 bg-background border border-border rounded-lg text-xs disabled:opacity-40 hover:bg-surface-hover transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setTaskPage((p) => p + 1)}
                  disabled={taskPage * tasksData.page_size >= tasksData.total}
                  className="px-3 py-1 bg-background border border-border rounded-lg text-xs disabled:opacity-40 hover:bg-surface-hover transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-xs text-text-muted mt-0.5">{label}</p>
    </div>
  );
}

function ServiceDot({ status }: { status: string }) {
  const color = status === 'healthy' ? 'bg-success' : status === 'degraded' ? 'bg-warning' : status === 'starting' ? 'bg-warning animate-pulse' : 'bg-error';
  return <span className={`w-2 h-2 rounded-full ${color}`} />;
}

function UserCard({ user, onSelect, active }: { user: AdminUser; onSelect: () => void; active: boolean }) {
  return (
    <button
      onClick={onSelect}
      className={`text-left bg-background rounded-lg border p-3 transition-colors ${
        active ? 'border-accent/40 bg-accent/5' : 'border-border/50 hover:border-border'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent">
          {user.username.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-medium text-text-primary truncate">{user.username}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <span className="text-text-muted">Total: <span className="text-text-secondary">{user.total_tasks}</span></span>
        <span className="text-text-muted">Active: <span className="text-accent">{user.active_tasks}</span></span>
        <span className="text-text-muted">Done: <span className="text-success">{user.completed_tasks}</span></span>
        <span className="text-text-muted">Failed: <span className="text-error">{user.failed_tasks}</span></span>
      </div>
      <p className="text-[10px] text-text-muted mt-1.5">{formatTimestamp(user.last_active)}</p>
    </button>
  );
}

function TaskRow({ task, onCancel }: { task: Task; onCancel: (taskId: string) => void }) {
  const isStoppable = task.status === 'running' || task.status === 'pending';
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-background rounded-lg border border-border/50 hover:border-border transition-colors">
      <span className="flex-shrink-0">{statusIcons[task.status] || statusIcons.pending}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary truncate">{truncateTitle(task.task_description)}</p>
        <p className="text-[10px] text-text-muted">
          Turn {task.current_turn} · {task.step_count} steps
        </p>
      </div>
      <span className={`text-[10px] font-medium ${statusColors[task.status] || 'text-text-muted'} capitalize`}>
        {task.status}
      </span>
      {isStoppable && (
        <button
          onClick={() => onCancel(task.id)}
          className="flex items-center gap-1 px-2 py-1 bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors text-[10px] font-medium"
          title="Stop task"
        >
          <Square className="w-2.5 h-2.5 fill-current" />
          Stop
        </button>
      )}
      <span className="text-[10px] text-text-muted flex-shrink-0">{formatTimestamp(task.created_at.toString())}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
