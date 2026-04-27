import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'MiroThinker',
  description: 'AI Research Agent for complex tasks',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
