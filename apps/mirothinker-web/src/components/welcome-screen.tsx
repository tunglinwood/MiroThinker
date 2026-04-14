'use client';

import { Bot, Sparkles, Search, Code, FileText, Lightbulb } from 'lucide-react';

interface WelcomeScreenProps {
  examples: string[];
  onSelectExample: (description: string) => void;
}

const features = [
  { icon: Search, label: 'Web Search', desc: 'Real-time information retrieval' },
  { icon: Code, label: 'Code Execution', desc: 'Run Python in sandbox' },
  { icon: FileText, label: 'Document Analysis', desc: 'Read and parse files' },
  { icon: Lightbulb, label: 'Multi-step Reasoning', desc: 'Complex problem solving' },
];

export function WelcomeScreen({ examples, onSelectExample }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Logo and title */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
          <Bot className="w-8 h-8 text-accent" />
        </div>
        <h1 className="text-3xl font-bold text-text-primary mb-2">MiroThinker</h1>
        <p className="text-text-secondary text-center max-w-md">
          An AI research agent that can search the web, execute code, and reason through complex tasks.
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10 max-w-2xl w-full">
        {features.map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="flex flex-col items-center text-center p-4 bg-surface border border-border rounded-xl"
          >
            <Icon className="w-5 h-5 text-accent mb-2" />
            <span className="text-sm font-medium text-text-primary">{label}</span>
            <span className="text-xs text-text-muted mt-0.5">{desc}</span>
          </div>
        ))}
      </div>

      {/* Example prompts */}
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-4 text-text-muted">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">Try asking</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {examples.map((example) => (
            <button
              key={example}
              onClick={() => onSelectExample(example)}
              className="text-left px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text-secondary hover:text-text-primary hover:border-accent/30 hover:bg-surface/80 transition-all"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
