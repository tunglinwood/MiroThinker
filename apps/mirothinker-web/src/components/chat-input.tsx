'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Loader2, X, FileText } from 'lucide-react';
import type { UploadResponse } from '@/lib/types';

interface ChatInputProps {
  onSubmit: (description: string) => void;
  onFileSelect: (file: File) => void;
  isUploading: boolean;
  isPending: boolean;
  isDisabled: boolean;
  uploadedFile: UploadResponse | null;
  onRemoveFile: () => void;
}

const EXAMPLE_PROMPTS = [
  'Search the web for the latest AI benchmark results',
  'Write a Python script to analyze stock trends',
  'Compare the features of React vs Vue',
  'Summarize the key findings of the latest research paper',
];

export function ChatInput({
  onSubmit,
  onFileSelect,
  isUploading,
  isPending,
  isDisabled,
  uploadedFile,
  onRemoveFile,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSubmit = () => {
    if (!input.trim() || isPending || isDisabled) return;
    onSubmit(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      e.target.value = '';
    }
  };

  const isDisabledSubmit = !input.trim() || isPending || isDisabled;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Uploaded file indicator */}
      {uploadedFile && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-surface border border-border rounded-lg">
          <FileText className="w-4 h-4 text-accent" />
          <span className="text-sm text-text-secondary truncate">{uploadedFile.file_name}</span>
          <button
            onClick={onRemoveFile}
            className="ml-auto p-0.5 hover:bg-error/10 rounded text-error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 bg-surface border border-border rounded-xl px-3 py-2 shadow-sm">
        {/* File upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-1.5 hover:bg-background-secondary rounded-lg transition-colors flex-shrink-0"
          title="Attach a file"
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 text-text-secondary animate-spin" />
          ) : (
            <Paperclip className="w-5 h-5 text-text-secondary" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept=".txt,.md,.csv,.json,.pdf,.doc,.docx"
        />

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          rows={1}
          disabled={isDisabled}
          className="flex-1 resize-none bg-transparent text-text-primary placeholder:text-text-muted text-sm leading-relaxed focus:outline-none disabled:opacity-50 max-h-[200px]"
        />

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={isDisabledSubmit}
          className="p-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Example prompts (only show when input is empty and not disabled) */}
      {!input && !uploadedFile && !isDisabled && (
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSubmit(prompt)}
              className="px-3 py-1.5 bg-surface border border-border rounded-full text-xs text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
