'use client'

import Link from 'next/link'
import { ArrowUpRight, Search } from 'lucide-react'

const researchTopics = [
  'Issuer domain risk',
  'Liquidity concentration',
  'Transfer restriction scoring',
  'Counterparty route review',
  'Policy drift evaluation',
]

export default function ResearchPage() {
  return (
    <div className="noshashi-shell">
      <section className="hero-panel">
        <div className="panel-header compact">
          <div className="chip chip-primary"><Search className="h-3.5 w-3.5" /> RESEARCH</div>
          <Link href="/" className="panel-link">Overview</Link>
        </div>
        <div className="hero-grid">
          <div>
            <p className="section-label">INTELLIGENCE</p>
            <h1 className="hero-title">Research environment and analysts workbench.</h1>
            <p className="hero-copy">Review asset details, trace evidence, and connect policy logic to the underlying ledger state before adjudicating decisions.</p>
          </div>
          <div className="mini-panel">
            <div className="metric-head"><span>Focus</span><span className="status-positive">active</span></div>
            <div className="metric-figure">6</div>
            <div className="metric-meta">Open research threads</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">TOPICS</p>
            <h2>Analyst workspace</h2>
          </div>
        </div>
        <div className="passport-grid">
          {researchTopics.map((topic) => (
            <div key={topic} className="passport-card">
              <div className="passport-kicker">TOPIC</div>
              <ul>
                <li>{topic}</li>
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="bottom-text"><ArrowUpRight className="h-4 w-4" /> Research output supports, but does not override, deterministic ledger analysis.</div>
      </footer>
    </div>
  )
}
