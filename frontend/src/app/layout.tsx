import type { Metadata } from 'next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Header from '@/components/Header'
import './globals.css'

export const metadata: Metadata = {
  title: 'NOSHASHI | Institutional Intelligence & Infrastructure for the XRP Ledger',
  description: 'Evidence-backed XRPL intelligence, deterministic policy analysis, monitoring, and programmable institutional infrastructure.',
}

const queryClient = new QueryClient()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
        <Header />
        <main className="relative">
          {children}
        </main>
      </body>
    </html>
  )
}
