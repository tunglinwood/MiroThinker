'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, CheckCircle, Bot, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SubAgentState, SseToolCall, Message } from '@/lib/types';
import { parseMessageContent } from '@/lib/parser';
import { simpleMarkdownToHtml } from '@/lib/markdown';
import { ToolRenderer } from './tool-renderer';

interface SubAgentPanelProps {
  subAgents: SubAgentState[];
}

export function SubAgentPanel({ subAgents }: SubAgentPanelProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show panel when sub-agents become active
  useEffect(() => {
    const runningCount = subAgents.filter((sa) => sa.status === 'running').length;
    if (runningCount > 0) {
      setVisible(true);
      setClosing(false);
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
      // Auto-select the first running sub-agent
      if (!activeTab || !subAgents.find((sa) => sa.id === activeTab)) {
        const firstRunning = subAgents.find((sa) => sa.status === 'running');
        if (firstRunning) setActiveTab(firstRunning.id);
      }
    }
  }, [subAgents]);

  // Auto-close 3 seconds after all complete
  useEffect(() => {
    const allDone = subAgents.length > 0 && subAgents.every((sa) => sa.status !== 'running');
    if (allDone && visible && !closing) {
      autoCloseTimer.current = setTimeout(() => {
        setClosing(true);
      }, 3000);
    }
    return () => {
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
    };
  }, [subAgents, visible, closing]);

  // Remove from DOM after close animation
  useEffect(() => {
    if (closing && visible) {
      const t = setTimeout(() => setVisible(false), 350);
      return () => clearTimeout(t);
    }
  }, [closing, visible]);

  // Hide if no sub-agents
  if (!visible || subAgents.length === 0) return null;

  const handleClose = () => {
    if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
    setClosing(true);
  };

  const runningCount = subAgents.filter((sa) => sa.status === 'running').length;
  const completedCount = subAgents.filter((sa) => sa.status === 'completed').length;

  // Collapsed badge — shows when panel is retracted
  if (collapsed) {
    return (
      <button
        onClick={() => { setCollapsed(false); setClosing(false); }}
        className="fixed right-3 top-20 z-40 flex items-center gap-2 px-3 py-2 rounded-full bg-accent/10 border border-accent/20 backdrop-blur-sm hover:bg-accent/20 transition-colors shadow-lg"
        title="Open sub-agents panel"
      >
        <Bot className="w-4 h-4 text-accent" />
        <span className="text-xs font-medium text-accent">
          {runningCount > 0 ? `${runningCount} running` : `${completedCount} done`}
        </span>
        <ChevronLeft className="w-3 h-3 text-accent/60" />
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${closing ? 'opacity-0' : 'opacity-100'}`}
        onClick={handleClose}
      />

      {/* Slide-in panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-[480px] max-w-[90vw] z-50 bg-background-secondary/95 backdrop-blur-sm border-l border-border/70 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          closing ? 'translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-accent" />
            </div>
            <div>
              <span className="text-sm font-semibold text-text-secondary">
                Sub-agents
              </span>
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                {runningCount > 0 && (
                  <>
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span>{runningCount} running</span>
                  </>
                )}
                {completedCount > 0 && (
                  <>
                    {runningCount > 0 && <span>&middot;</span>}
                    <CheckCircle className="w-2.5 h-2.5 text-success" />
                    <span>{completedCount} completed</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
              title="Collapse panel"
            >
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
              title="Close panel"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {subAgents.length > 1 && (
          <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50 overflow-x-auto">
            {subAgents.map((sa) => (
              <button
                key={sa.id}
                onClick={() => setActiveTab(sa.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === sa.id
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface'
                }`}
              >
                {sa.name}
                {sa.status === 'completed' && (
                  <CheckCircle className="w-3 h-3 inline ml-1 text-success" />
                )}
                {sa.status === 'running' && (
                  <Loader2 className="w-3 h-3 inline ml-1 animate-spin" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Active sub-agent content */}
        {(() => {
          const active = activeTab
            ? subAgents.find((sa) => sa.id === activeTab)
            : subAgents.find((sa) => sa.status === 'running') || subAgents[0];
          if (!active) return null;

          return <SubAgentContent key={active.id} subAgent={active} />;
        })()}
      </div>
    </>
  );
}

/** Renders the content for a single sub-agent */
function SubAgentContent({ subAgent }: { subAgent: SubAgentState }) {
  const parsedMessages = subAgent.messages.map((msg) => parseMessageContent(msg.content));

  return (
    <>
      {/* Task description */}
      <div className="px-4 py-3 border-b border-border/50">
        <p className="text-xs font-medium text-text-muted mb-1">Subtask</p>
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-4">
          {subAgent.taskDescription}
        </p>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Messages */}
        {parsedMessages.map((parsed, idx) => {
          const hasContent = parsed.thinking || (parsed.text && idx > 0);
          if (!hasContent) return null;

          return (
            <div key={idx} className="space-y-2">
              {parsed.thinking && (
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-accent/5 border border-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-accent/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 bg-accent/5 border border-accent/10 rounded-lg p-2.5">
                    <span className="text-[10px] font-medium text-accent/70">Thinking</span>
                    <pre className="text-xs text-text-secondary/80 whitespace-pre-wrap leading-relaxed overflow-x-auto mt-0.5">
                      {parsed.thinking}
                    </pre>
                  </div>
                </div>
              )}
              {parsed.text && idx > 0 && (
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-surface/50 border border-border/50 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-medium text-text-muted">
                    A
                  </div>
                  <div className="flex-1 bg-surface/50 border border-border/50 rounded-lg px-2.5 py-1.5 markdown-content">
                    <div
                      className="text-xs text-text-secondary/80 whitespace-pre-wrap leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(parsed.text) }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Tool calls */}
        {subAgent.toolCalls.length > 0 && (
          <div className="space-y-3">
            {subAgent.toolCalls.map((tc) => (
              <ToolRenderer key={tc.tool_call_id} toolCall={tc} />
            ))}
          </div>
        )}
      </div>

      {/* Result footer — shown when completed */}
      {subAgent.status === 'completed' && subAgent.result && (
        <div className="border-t border-border/70 p-4 max-h-48 overflow-y-auto">
          <p className="text-xs font-medium text-success mb-2">Result</p>
          <pre className="text-xs text-text-secondary/80 whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {subAgent.result}
          </pre>
        </div>
      )}
    </>
  );
}
