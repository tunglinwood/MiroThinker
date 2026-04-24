'use client';

import { useState } from 'react';
import { Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface IntermediateStepsProps {
  steps: Array<{
    text: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    timestamp?: string;
  }>;
  status?: string;
}

const typeIcons: Record<string, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertCircle,
  error: AlertCircle,
};

const typeColors: Record<string, string> = {
  info: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  success: 'text-green-400 bg-green-400/10 border-green-400/20',
  warning: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  error: 'text-red-400 bg-red-400/10 border-red-400/20',
};

const typeDotColors: Record<string, string> = {
  info: 'bg-blue-400',
  success: 'bg-green-400',
  warning: 'bg-yellow-400',
  error: 'bg-red-400',
};

function detectStepType(text: string): 'info' | 'success' | 'warning' | 'error' {
  const lower = text.toLowerCase();
  if (lower.includes('error') || lower.includes('fail') || lower.includes('exception')) return 'error';
  if (lower.includes('success') || lower.includes('complete') || lower.includes('done') || lower.includes('answer')) return 'success';
  if (lower.includes('warning') || lower.includes('timeout') || lower.includes('retry')) return 'warning';
  return 'info';
}

export function IntermediateSteps({ steps, status = 'running' }: IntermediateStepsProps) {
  const [expanded, setExpanded] = useState(false);

  if (steps.length === 0) return null;

  const showCount = expanded ? steps.length : Math.min(3, steps.length);
  const visibleSteps = steps.slice(0, showCount);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />}
          <span className="text-sm font-medium text-text-secondary">
            Agent progress
          </span>
          <span className="text-xs text-text-muted">
            {steps.length} step{steps.length !== 1 ? 's' : ''}
          </span>
        </div>
        {steps.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-accent hover:text-accent/80 transition-colors"
          >
            {expanded ? 'Show less' : `Show all ${steps.length}`}
          </button>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-1.5 pl-1">
        {visibleSteps.map((step, i) => {
          const stepType = step.type || detectStepType(step.text);
          const Icon = typeIcons[stepType];
          const colorClass = typeColors[stepType];
          const dotColor = typeDotColors[stepType];

          return (
            <div key={i} className="flex items-start gap-2">
              <div className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
              <div className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg border ${colorClass}`}>
                {step.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
