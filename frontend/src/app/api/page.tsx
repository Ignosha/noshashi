'use client'

import Link from 'next/link'
import { ArrowUpRight, ServerCog } from 'lucide-react'

const endpoints = [
  { method: 'GET', path: '/api/v1/assets', intent: 'Asset metadata query' },
  { method: 'GET', path: '/api/v1/evidence', intent: 'Evidence lookup' },
  { method: 'POST', path: '/api/v1/policies/check', intent: 'Policy score request' },
]

export default function ApiPage() {
  return (
    <div className="noshashi-shell">
      <section className="hero-panel">
        <div className="panel-header compact">
          <div className="chip chip-primary"><ServerCog className="h-3.5 w-3.5" /> API</div>
          <Link href="/" className="panel-link">Overview</Link>
        </div>
        <div className="hero-grid">
          <div>
            <p className="section-label">PROGRAMMATIC ACCESS</p>
            <h1 className="hero-title">Institutional API layer.</h1>
            <p className="hero-copy">Expose deterministic asset, policy, and evidence data to internal systems, business workflows, and partner integrations.</p>
          </div>
          <div className="mini-panel">
            <div className="metric-head"><span>API status</span><span className="status-positive">healthy</span></div>
            <div className="metric-figure">v1</div>
            <div className="metric-meta">Operational contract version</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">ENDPOINTS</p>
            <h2>Accessible interfaces</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="data-row header-row">
            <span>Method</span>
            <span>Path</span>
            <span>Intent</span>
          </div>
          {endpoints.map((item) => (
            <div key={item.path} className="data-row">
              <span>{item.method}</span>
              <span>{item.path}</span>
              <span>{item.intent}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="bottom-text"><ArrowUpRight className="h-4 w-4" /> API access should support controlled automation without replacing human review.</div>
      </footer>
    </div>
  )
}
