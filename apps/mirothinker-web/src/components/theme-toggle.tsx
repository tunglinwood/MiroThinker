'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/use-theme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // During SSR, render a placeholder to avoid hydration mismatch
  if (!mounted) {
    return (
      <button
        onClick={toggleTheme}
        className="relative w-10 h-5 rounded-full bg-background-secondary border border-border hover:border-border-hover transition-colors"
        aria-label="Toggle theme"
      >
        <div className="absolute top-0.5 w-4 h-4 rounded-full bg-accent transition-all duration-300 left-0.5" />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="relative w-10 h-5 rounded-full bg-background-secondary border border-border hover:border-border-hover transition-colors"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {/* Track glow */}
      <div className={`absolute inset-0 rounded-full transition-opacity duration-300 ${
        isDark ? 'opacity-0' : 'opacity-100 bg-accent-muted'
      }`} />
      {/* Thumb */}
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-accent transition-all duration-300 flex items-center justify-center ${
          isDark ? 'left-0.5' : 'left-[22px]'
        }`}
      >
        {isDark ? (
          <Moon className="w-2.5 h-2.5 text-white" />
        ) : (
          <Sun className="w-2.5 h-2.5 text-white" />
        )}
      </div>
    </button>
  );
}
