import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'KnowBase — Your AI Second Brain',
  description: 'A professional AI-powered personal knowledge base with hybrid RAG, memory, and cited responses.',
  keywords: ['knowledge base', 'AI', 'RAG', 'personal notes', 'second brain'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body style={{ backgroundColor: '#0B1020', color: '#EAF1FF' }}>
        {children}
      </body>
    </html>
  );
}
