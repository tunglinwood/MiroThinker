'use client';

import { useState } from 'react';
import { enterPassword } from '@/lib/api';
import { Bot } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password.trim() || !username.trim()) {
      setError('Both fields are required');
      return;
    }

    setLoading(true);
    try {
      await enterPassword(password, username.trim());
      window.location.href = '/';
    } catch (err: unknown) {
      const message =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Failed to authenticate';
      setError(message || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-text-primary">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
            <Bot className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-xl font-semibold">MiroThinker</h1>
          <p className="text-sm text-text-secondary">Enter your credentials to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1.5 text-text-secondary">
              Display name
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alice"
              maxLength={50}
              className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5 text-text-secondary">
              Access password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Shared access password"
              className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
